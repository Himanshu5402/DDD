import Asset from '../../models/asset.model.js';
import MaintenanceRecord from '../../models/maintenanceRecord.model.js';
import User from '../../models/user.model.js';
import Role from '../../models/role.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';
import { notifyMany } from '../notifications/notifications.service.js';

const ENTITY = 'asset';

const LIST_POPULATE = [
  { path: 'product', select: 'name' },
  { path: 'assignedTo', select: 'name email' },
];

const DETAIL_POPULATE = [
  { path: 'product', select: 'name' },
  { path: 'assignedTo', select: 'name email' },
  { path: 'createdBy', select: 'name email avatar' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the Mongo filter for the asset list. */
function buildFilter(query = {}) {
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.product) filter.product = query.product;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.setupNumber) filter.setupNumber = query.setupNumber;
  if (query.department) filter.department = query.department;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { location: rx }, { department: rx }, { setupNumber: rx }];
  }

  return filter;
}

export async function listAssets(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    Asset.find(filter).populate(LIST_POPULATE).sort(sort).skip(skip).limit(limit),
    Asset.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getAsset(id) {
  const asset = await Asset.findById(id).populate(DETAIL_POPULATE);
  if (!asset) throw ApiError.notFound('Asset not found');

  // Last 10 maintenance records for this asset (newest scheduled first).
  const records = await MaintenanceRecord.find({ asset: id })
    .populate({ path: 'performedBy', select: 'name email' })
    .sort({ scheduledFor: -1 })
    .limit(10);

  return { asset, records };
}

/** Ensure no other asset already uses this code (unique sparse index). */
async function assertCodeAvailable(code, excludeId) {
  const filter = { code: String(code).toUpperCase().trim() };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await Asset.findOne(filter);
  if (exists) throw ApiError.conflict(`An asset with code "${filter.code}" already exists`);
}

export async function createAsset(data, user) {
  if (data.code) await assertCodeAvailable(data.code);

  const customFields = data.customFields
    ? await validateCustomFields(ENTITY, data.customFields)
    : {};

  const asset = await Asset.create({
    ...data,
    customFields,
    createdBy: user._id,
  });

  return Asset.findById(asset._id).populate(LIST_POPULATE);
}

const UPDATABLE = [
  'name', 'code', 'product', 'category', 'location', 'department', 'room', 'setupNumber',
  'status', 'purchaseDate', 'purchaseCost', 'warrantyUntil', 'amc', 'specs', 'assignedTo',
];

export async function updateAsset(id, data) {
  const asset = await Asset.findById(id);
  if (!asset) throw ApiError.notFound('Asset not found');

  if (data.code) await assertCodeAvailable(data.code, id);

  for (const f of UPDATABLE) if (data[f] !== undefined) asset[f] = data[f];

  if (data.customFields !== undefined) {
    const merged = { ...asset.customFields, ...data.customFields };
    asset.customFields = await validateCustomFields(ENTITY, merged, { partial: true });
  }

  await asset.save();
  return Asset.findById(asset._id).populate(LIST_POPULATE);
}

export async function deleteAsset(id) {
  const asset = await Asset.findById(id);
  if (!asset) throw ApiError.notFound('Asset not found');

  const recordCount = await MaintenanceRecord.countDocuments({ asset: id });
  if (recordCount > 0) {
    throw ApiError.badRequest(
      `Cannot delete: asset has ${recordCount} maintenance record(s). Delete those first or retire the asset instead.`
    );
  }

  await asset.deleteOne();
  return { success: true };
}

// --- Assignment + employee self-service --------------------------------------

/** Ids of every active admin / super-admin. */
async function getAdminUserIds() {
  const roleIds = await Role.find({
    slug: { $in: [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMIN] },
  }).distinct('_id');
  return User.find({ roles: { $in: roleIds }, isActive: true }).distinct('_id');
}

/**
 * Assign an asset — and every component that shares its setup number — to one
 * employee, so a whole workstation moves together. Passing assignedTo=null
 * unassigns the setup. A lone asset (no setup number) is assigned by itself.
 */
export async function assignSetup(id, assignedTo) {
  const asset = await Asset.findById(id);
  if (!asset) throw ApiError.notFound('Asset not found');

  const assignee = assignedTo || null;
  const setupFilter = asset.setupNumber ? { setupNumber: asset.setupNumber } : { _id: asset._id };

  await Asset.updateMany(setupFilter, { $set: { assignedTo: assignee } });

  const items = await Asset.find(setupFilter).populate(LIST_POPULATE).sort({ category: 1, code: 1 });

  // Let the employee know a setup landed on them.
  if (assignee) {
    await notifyMany([String(assignee)], {
      actor: null,
      type: 'generic',
      message: `🖥️ A workstation setup (${items.length} component${items.length === 1 ? '' : 's'}${asset.setupNumber ? `, #${asset.setupNumber}` : ''}) was assigned to you`,
      entityType: 'asset',
      entityId: asset._id,
      link: '/maintenance',
    });
  }

  return { setupNumber: asset.setupNumber, assignedTo: assignee, count: items.length, items };
}

/** Assets currently assigned to a given user (their workstation setup). */
export async function listMyAssets(userId) {
  return Asset.find({ assignedTo: userId })
    .populate(LIST_POPULATE)
    .sort({ setupNumber: 1, category: 1, code: 1 });
}

/**
 * Employee self-service: raise a maintenance record against an asset that is
 * assigned to the requesting user. Admins reporting on any asset use the normal
 * Maintenance form instead — this endpoint enforces ownership.
 */
export async function reportAssetIssue(id, data, user) {
  const asset = await Asset.findById(id);
  if (!asset) throw ApiError.notFound('Asset not found');

  const owns = asset.assignedTo && String(asset.assignedTo) === String(user._id);
  if (!owns) throw ApiError.forbidden('You can only report maintenance for assets assigned to you');

  const reason = data.reason.trim();
  const record = await MaintenanceRecord.create({
    title: `${asset.name}${asset.code ? ` (${asset.code})` : ''} — ${reason.slice(0, 80)}`,
    asset: asset._id,
    type: data.type || 'breakdown',
    status: 'scheduled',
    scheduledFor: data.scheduledFor || new Date(),
    notes: reason,
    createdBy: user._id,
  });

  if (asset.status === 'operational') {
    asset.status = 'under_maintenance';
    await asset.save();
  }

  // Alert admins immediately that an employee reported an issue.
  const adminIds = (await getAdminUserIds()).map(String);
  if (adminIds.length) {
    await notifyMany(adminIds, {
      actor: user._id,
      type: 'maintenance_due',
      message: `🔧 ${user.name} reported an issue on ${asset.name}${asset.code ? ` (${asset.code})` : ''}: "${reason.slice(0, 100)}"`,
      entityType: 'maintenanceRecord',
      entityId: record._id,
      link: '/maintenance',
    });
  }

  return MaintenanceRecord.findById(record._id).populate([{ path: 'asset', select: 'name code' }]);
}
