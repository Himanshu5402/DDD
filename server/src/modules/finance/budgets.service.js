import Budget from '../../models/budget.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

const POPULATE = [{ path: 'createdBy', select: 'name email avatar' }];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query = {}) {
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.period) filter.period = query.period;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { category: rx }, { notes: rx }];
  }
  return filter;
}

export async function listBudgets(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    Budget.find(filter).populate(POPULATE).sort(sort).skip(skip).limit(limit),
    Budget.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function createBudget(data, user) {
  const budget = await Budget.create({ ...data, createdBy: user._id });
  return Budget.findById(budget._id).populate(POPULATE);
}

const UPDATABLE = ['name', 'category', 'period', 'amount', 'startDate', 'endDate', 'notes'];

export async function updateBudget(id, data) {
  const budget = await Budget.findById(id);
  if (!budget) throw ApiError.notFound('Budget not found');

  for (const f of UPDATABLE) if (data[f] !== undefined) budget[f] = data[f];

  await budget.save();
  return Budget.findById(budget._id).populate(POPULATE);
}

export async function deleteBudget(id) {
  const budget = await Budget.findById(id);
  if (!budget) throw ApiError.notFound('Budget not found');
  await budget.deleteOne();
  return { success: true };
}
