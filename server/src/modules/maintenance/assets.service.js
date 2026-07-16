import Asset from '../../models/asset.model.js';
import MaintenanceRecord from '../../models/maintenanceRecord.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';

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

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { location: rx }];
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
  'name', 'code', 'product', 'category', 'location', 'status',
  'purchaseDate', 'purchaseCost', 'warrantyUntil', 'amc', 'specs', 'assignedTo',
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
