import Asset from '../../models/asset.model.js';
import MaintenanceRecord from '../../models/maintenanceRecord.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

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
  const asset = await Asset.findById(data.asset);
  if (!asset) throw ApiError.badRequest('Asset does not exist');

  const record = await MaintenanceRecord.create({ ...data, createdBy: user._id });

  // Reflect the maintenance event on the asset itself.
  if (record.type === 'breakdown') asset.status = 'breakdown';
  if (record.status === 'in_progress') asset.status = 'under_maintenance';
  if (asset.isModified('status')) await asset.save();

  return MaintenanceRecord.findById(record._id).populate(POPULATE);
}

const UPDATABLE = [
  'type', 'status', 'scheduledFor', 'completedAt', 'technician',
  'performedBy', 'cost', 'notes', 'partsUsed',
];

export async function updateRecord(id, data) {
  const record = await MaintenanceRecord.findById(id);
  if (!record) throw ApiError.notFound('Maintenance record not found');

  const wasCompleted = record.status === 'completed';

  for (const f of UPDATABLE) if (data[f] !== undefined) record[f] = data[f];

  // Completing a job stamps the completion time and puts the asset back in service.
  if (record.status === 'completed' && !wasCompleted) {
    if (!record.completedAt) record.completedAt = new Date();
    await Asset.updateOne({ _id: record.asset }, { status: 'operational' });
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
 * Everything coming due within the next `days` days:
 * scheduled/in-progress maintenance, expiring warranties and expiring AMCs.
 */
export async function getUpcoming(query = {}) {
  const days = query.days || 30;
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const range = { $gte: now, $lte: until };

  const [records, expiringWarranties, expiringAmc] = await Promise.all([
    MaintenanceRecord.find({ status: { $in: ['scheduled', 'in_progress'] }, scheduledFor: range })
      .populate({ path: 'asset', select: 'name code location status' })
      .sort({ scheduledFor: 1 }),
    Asset.find({ warrantyUntil: range })
      .select('name code category location status warrantyUntil')
      .sort({ warrantyUntil: 1 }),
    Asset.find({ 'amc.validUntil': range })
      .select('name code category location status amc')
      .sort({ 'amc.validUntil': 1 }),
  ]);

  return { days, records, expiringWarranties, expiringAmc };
}
