import Renewal from '../../models/renewal.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

const POPULATE = [
  { path: 'customer', select: 'name company email' },
  { path: 'product', select: 'name' },
  { path: 'createdBy', select: 'name email avatar' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.customer) filter.customer = query.customer;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: rx }, { notes: rx }, { leadId: rx }];
  }
  return filter;
}

export async function listRenewals(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  // Default to due-date ordering (soonest first) unless an explicit sort is given.
  const effectiveSort = query.sort ? sort : { dueDate: 1 };

  const [items, total] = await Promise.all([
    Renewal.find(filter).populate(POPULATE).sort(effectiveSort).skip(skip).limit(limit),
    Renewal.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getRenewal(id) {
  const renewal = await Renewal.findById(id).populate(POPULATE);
  if (!renewal) throw ApiError.notFound('Renewal not found');
  return renewal;
}

export async function createRenewal(data, user) {
  const renewal = await Renewal.create({ ...data, createdBy: user._id });
  return Renewal.findById(renewal._id).populate(POPULATE);
}

const UPDATABLE = [
  'title', 'customer', 'product', 'amount', 'currency',
  'dueDate', 'status', 'autoRenew', 'notes', 'color',
];

export async function updateRenewal(id, data) {
  const renewal = await Renewal.findById(id);
  if (!renewal) throw ApiError.notFound('Renewal not found');

  for (const f of UPDATABLE) if (data[f] !== undefined) renewal[f] = data[f];

  await renewal.save();
  return Renewal.findById(renewal._id).populate(POPULATE);
}

export async function deleteRenewal(id) {
  const renewal = await Renewal.findById(id);
  if (!renewal) throw ApiError.notFound('Renewal not found');
  await renewal.deleteOne();
  return { success: true };
}
