import ExpiryItem from '../../models/expiryItem.model.js';
import User from '../../models/user.model.js';
import Role from '../../models/role.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { notifyMany } from '../notifications/notifications.service.js';

const EXPIRY_LINK = '/maintenance';

const POPULATE = [
  { path: 'owner', select: 'name email' },
  { path: 'createdBy', select: 'name email avatar' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole calendar days from `now` until `date` (negative once overdue). */
function diffInCalendarDays(date, now) {
  const a = new Date(date);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** Advance a date by one recurrence period (null for non-recurring items). */
function addRecurrence(date, recurrence) {
  const d = new Date(date);
  switch (recurrence) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'half_yearly': d.setMonth(d.getMonth() + 6); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  return d;
}

/** Ids of every active admin / super-admin — always notified about expiries. */
async function getAdminUserIds() {
  const roleIds = await Role.find({
    slug: { $in: [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMIN] },
  }).distinct('_id');
  return User.find({ roles: { $in: roleIds }, isActive: true }).distinct('_id');
}

// --- CRUD --------------------------------------------------------------------

function buildFilter(query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { provider: rx }, { accountRef: rx }];
  }
  if (query.from || query.to) {
    filter.dueDate = {};
    if (query.from) filter.dueDate.$gte = query.from;
    if (query.to) filter.dueDate.$lte = query.to;
  }
  return filter;
}

export async function listExpiries(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  // Default to soonest-due first unless an explicit sort is given.
  const effectiveSort = query.sort ? sort : { dueDate: 1 };

  const [items, total] = await Promise.all([
    ExpiryItem.find(filter).populate(POPULATE).sort(effectiveSort).skip(skip).limit(limit),
    ExpiryItem.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function createExpiry(data, user) {
  const item = await ExpiryItem.create({ ...data, createdBy: user._id });
  return ExpiryItem.findById(item._id).populate(POPULATE);
}

const UPDATABLE = [
  'name', 'category', 'provider', 'accountRef', 'amount',
  'dueDate', 'recurrence', 'status', 'reminderDaysBefore', 'owner', 'notes',
];

export async function updateExpiry(id, data) {
  const item = await ExpiryItem.findById(id);
  if (!item) throw ApiError.notFound('Expiry item not found');

  // Moving the due date (or reactivating) starts a fresh reminder cycle.
  const dueChanged =
    data.dueDate !== undefined &&
    new Date(data.dueDate).getTime() !== new Date(item.dueDate).getTime();
  const reactivated = data.status === 'active' && item.status !== 'active';

  for (const f of UPDATABLE) if (data[f] !== undefined) item[f] = data[f];

  if (dueChanged || reactivated) {
    item.remindersSent = [];
    item.lastRemindedAt = null;
  }

  await item.save();
  return ExpiryItem.findById(item._id).populate(POPULATE);
}

export async function deleteExpiry(id) {
  const item = await ExpiryItem.findById(id);
  if (!item) throw ApiError.notFound('Expiry item not found');
  await item.deleteOne();
  return { success: true };
}

/**
 * Mark an item renewed. Recurring items roll their due date forward by one
 * period (skipping past periods if long overdue) and re-enter the reminder
 * cycle; one-off items are simply marked paid.
 */
export async function renewExpiry(id) {
  const item = await ExpiryItem.findById(id);
  if (!item) throw ApiError.notFound('Expiry item not found');

  if (item.recurrence === 'none') {
    item.status = 'paid';
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let next = addRecurrence(item.dueDate, item.recurrence);
    while (next && next <= today) next = addRecurrence(next, item.recurrence);
    item.dueDate = next;
    item.status = 'active';
    item.remindersSent = [];
    item.lastRemindedAt = null;
  }

  await item.save();
  return ExpiryItem.findById(item._id).populate(POPULATE);
}

// --- Upcoming integration ----------------------------------------------------

/**
 * Active bills/renewals due on or before `until` — includes already-overdue
 * items so they keep surfacing until renewed. Consumed by getUpcoming().
 */
export function findExpiringBills(until) {
  return ExpiryItem.find({ status: 'active', dueDate: { $lte: until } })
    .populate({ path: 'owner', select: 'name email' })
    .sort({ dueDate: 1 });
}

// --- Reminder sweep ----------------------------------------------------------

/** Which reminder stage (if any) an active item is currently in. */
function reminderStageFor(item, now) {
  const daysLeft = diffInCalendarDays(item.dueDate, now);
  const threshold = item.reminderDaysBefore ?? 3;
  let key = null;
  if (daysLeft < 0) key = 'overdue';
  else if (daysLeft === 0) key = 'due';
  else if (daysLeft === 1) key = 'due_soon';
  else if (daysLeft <= threshold) key = 'upcoming';
  return { key, daysLeft };
}

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function buildReminderMessage(item, stage, daysLeft) {
  const label = item.name + (item.provider ? ` (${item.provider})` : '');
  const cost = item.amount ? ` · ${money(item.amount)}` : '';
  const on = ` — due ${new Date(item.dueDate).toLocaleDateString('en-IN')}`;
  switch (stage) {
    case 'overdue': {
      const n = Math.abs(daysLeft);
      return `⚠️ ${label} expired ${n} day${n === 1 ? '' : 's'} ago${on}${cost} — please renew`;
    }
    case 'due':
      return `⚠️ ${label} expires today${on}${cost}`;
    case 'due_soon':
      return `⏰ ${label} expires tomorrow — 1 day left${on}${cost}`;
    case 'upcoming':
      return `🔔 ${label} expires in ${daysLeft} days${on}${cost}`;
    default:
      return `${label} renewal reminder${on}`;
  }
}

/**
 * Walk active expiry items and notify admins (+ the item owner) about anything
 * entering a new reminder stage. Each stage fires at most once per due-date
 * cycle (tracked in `remindersSent`), so repeated sweeps never spam. Called at
 * boot, on an interval by the scheduler, and on demand via the API.
 */
export async function runReminderSweep() {
  const now = new Date();
  // Widest horizon we could need: the max configurable lead time (+ overdue).
  const horizon = new Date(now.getTime() + 95 * 86400000);

  const [items, adminIds] = await Promise.all([
    ExpiryItem.find({ status: 'active', dueDate: { $lte: horizon } }),
    getAdminUserIds(),
  ]);

  const admins = adminIds.map(String);
  let notified = 0;

  for (const item of items) {
    const { key, daysLeft } = reminderStageFor(item, now);
    if (!key) continue;
    if ((item.remindersSent || []).includes(key)) continue;

    const recipients = [...admins];
    if (item.owner) recipients.push(String(item.owner));

    await notifyMany(recipients, {
      actor: null,
      type: 'expiry_due',
      message: buildReminderMessage(item, key, daysLeft),
      entityType: 'expiryItem',
      entityId: item._id,
      link: EXPIRY_LINK,
    });

    item.remindersSent = [...new Set([...(item.remindersSent || []), key])];
    item.lastRemindedAt = now;
    await item.save();
    notified += 1;
  }

  return { checked: items.length, notified };
}
