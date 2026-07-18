import Asset from '../../models/asset.model.js';
import MaintenanceRecord from '../../models/maintenanceRecord.model.js';
import User from '../../models/user.model.js';
import Role from '../../models/role.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { notifyMany } from '../notifications/notifications.service.js';
import { findExpiringBills } from './expiries.service.js';

const POPULATE = [
  { path: 'asset', select: 'name code' },
  { path: 'performedBy', select: 'name email' },
  { path: 'createdBy', select: 'name email avatar' },
];

/** Build the Mongo filter for the maintenance record list. */
function buildFilter(query = {}) {
  const filter = {};

  if (query.asset) filter.asset = query.asset;
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;

  if (query.from || query.to) {
    filter.scheduledFor = {};
    if (query.from) filter.scheduledFor.$gte = query.from;
    if (query.to) filter.scheduledFor.$lte = query.to;
  }

  return filter;
}

export async function listRecords(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  // Default to schedule ordering (latest first) unless an explicit sort is given.
  const effectiveSort = query.sort ? sort : { scheduledFor: -1 };

  const [items, total] = await Promise.all([
    MaintenanceRecord.find(filter).populate(POPULATE).sort(effectiveSort).skip(skip).limit(limit),
    MaintenanceRecord.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function createRecord(data, user) {
  // Asset is optional — a record may just carry a free-text `title`.
  let asset = null;
  if (data.asset) {
    asset = await Asset.findById(data.asset);
    if (!asset) throw ApiError.badRequest('Asset does not exist');
  }

  const record = await MaintenanceRecord.create({ ...data, createdBy: user._id });

  // Reflect the maintenance event on the linked asset (if any).
  if (asset) {
    if (record.type === 'breakdown') asset.status = 'breakdown';
    if (record.status === 'in_progress') asset.status = 'under_maintenance';
    if (asset.isModified('status')) await asset.save();
  }

  return MaintenanceRecord.findById(record._id).populate(POPULATE);
}

const UPDATABLE = [
  'title', 'asset', 'type', 'status', 'scheduledFor', 'completedAt', 'technician',
  'performedBy', 'cost', 'notes', 'partsUsed', 'reminderDaysBefore',
];

export async function updateRecord(id, data) {
  const record = await MaintenanceRecord.findById(id);
  if (!record) throw ApiError.notFound('Maintenance record not found');

  const wasCompleted = record.status === 'completed';
  // Rescheduling, or re-opening a closed job, starts a fresh reminder cycle.
  const scheduleChanged =
    data.scheduledFor !== undefined &&
    new Date(data.scheduledFor).getTime() !== new Date(record.scheduledFor).getTime();
  const reopened =
    data.status !== undefined &&
    ['scheduled', 'in_progress'].includes(data.status) &&
    ['completed', 'cancelled'].includes(record.status);

  for (const f of UPDATABLE) if (data[f] !== undefined) record[f] = data[f];

  if (scheduleChanged || reopened) {
    record.remindersSent = [];
    record.lastRemindedAt = null;
  }

  // Completing a job stamps the completion time and puts any linked asset back in service.
  if (record.status === 'completed' && !wasCompleted) {
    if (!record.completedAt) record.completedAt = new Date();
    if (record.asset) await Asset.updateOne({ _id: record.asset }, { status: 'operational' });
  }

  await record.save();
  return MaintenanceRecord.findById(record._id).populate(POPULATE);
}

export async function deleteRecord(id) {
  const record = await MaintenanceRecord.findById(id);
  if (!record) throw ApiError.notFound('Maintenance record not found');
  await record.deleteOne();
  return { success: true };
}

/**
 * Everything coming due within the next `days` days: scheduled/in-progress
 * maintenance, expiring warranties, expiring AMCs and bills/renewals due soon.
 * Bills include already-overdue items so short-expiry things (recharges, light
 * bills) keep surfacing until renewed.
 */
export async function getUpcoming(query = {}) {
  const days = query.days || 30;
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const range = { $gte: now, $lte: until };

  const [records, expiringWarranties, expiringAmc, expiringBills] = await Promise.all([
    // Open jobs due within the window — plus anything already overdue, so a
    // pending repair keeps surfacing (most urgent) instead of dropping off.
    MaintenanceRecord.find({ status: { $in: ['scheduled', 'in_progress'] }, scheduledFor: { $lte: until } })
      .populate({ path: 'asset', select: 'name code location status' })
      .sort({ scheduledFor: 1 }),
    Asset.find({ warrantyUntil: range })
      .select('name code category location status warrantyUntil')
      .sort({ warrantyUntil: 1 }),
    Asset.find({ 'amc.validUntil': range })
      .select('name code category location status amc')
      .sort({ 'amc.validUntil': 1 }),
    findExpiringBills(until),
  ]);

  return { days, records, expiringWarranties, expiringAmc, expiringBills };
}

// --- Reminder sweep ----------------------------------------------------------

/** Whole calendar days from `now` until `date` (negative once overdue). */
function diffInCalendarDays(date, now) {
  const a = new Date(date); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** Ids of every active admin / super-admin — always notified about due jobs. */
async function getAdminUserIds() {
  const roleIds = await Role.find({
    slug: { $in: [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMIN] },
  }).distinct('_id');
  return User.find({ roles: { $in: roleIds }, isActive: true }).distinct('_id');
}

/** Which reminder stage (if any) a scheduled record is currently in. */
function reminderStageFor(record, now) {
  const daysLeft = diffInCalendarDays(record.scheduledFor, now);
  const threshold = record.reminderDaysBefore ?? 2;
  let key = null;
  if (daysLeft < 0) key = 'overdue';
  else if (daysLeft === 0) key = 'due';
  else if (daysLeft === 1) key = 'due_soon';
  else if (daysLeft <= threshold) key = 'upcoming';
  return { key, daysLeft };
}

function recordLabel(record) {
  return record.title || record.asset?.name || 'Maintenance task';
}

function buildMaintenanceMessage(record, stage, daysLeft) {
  const label = recordLabel(record);
  const on = ` — scheduled ${new Date(record.scheduledFor).toLocaleDateString('en-IN')}`;
  const who = record.technician ? ` · ${record.technician}` : '';
  switch (stage) {
    case 'overdue': {
      const n = Math.abs(daysLeft);
      return `⚠️ ${label} was due ${n} day${n === 1 ? '' : 's'} ago${on}${who} — still pending`;
    }
    case 'due':
      return `🔧 ${label} is due today${on}${who}`;
    case 'due_soon':
      return `⏰ ${label} is due tomorrow — 1 day left${on}${who}`;
    case 'upcoming':
      return `🔔 ${label} due in ${daysLeft} days${on}${who}`;
    default:
      return `${label} maintenance reminder${on}`;
  }
}

/**
 * Walk scheduled/in-progress maintenance records and notify admins (+ the
 * assigned user) about anything entering a new reminder stage. Each stage fires
 * at most once per schedule cycle (tracked in `remindersSent`), so repeated
 * sweeps never spam. Called at boot, on an interval by the scheduler, and on
 * demand via the API.
 */
export async function runMaintenanceReminderSweep() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 95 * 86400000);

  const [records, adminIds] = await Promise.all([
    MaintenanceRecord.find({
      status: { $in: ['scheduled', 'in_progress'] },
      scheduledFor: { $lte: horizon },
    }).populate({ path: 'asset', select: 'name code' }),
    getAdminUserIds(),
  ]);

  const admins = adminIds.map(String);
  let notified = 0;

  for (const record of records) {
    const { key, daysLeft } = reminderStageFor(record, now);
    if (!key) continue;
    if ((record.remindersSent || []).includes(key)) continue;

    const recipients = [...admins];
    if (record.performedBy) recipients.push(String(record.performedBy));

    await notifyMany(recipients, {
      actor: null,
      type: 'maintenance_due',
      message: buildMaintenanceMessage(record, key, daysLeft),
      entityType: 'maintenanceRecord',
      entityId: record._id,
      link: '/maintenance',
    });

    record.remindersSent = [...new Set([...(record.remindersSent || []), key])];
    record.lastRemindedAt = now;
    await record.save();
    notified += 1;
  }

  return { checked: records.length, notified };
}
