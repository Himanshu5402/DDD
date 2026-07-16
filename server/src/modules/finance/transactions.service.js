import Transaction from '../../models/transaction.model.js';
import Budget from '../../models/budget.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';
import { getAI } from '../../services/ai/index.js';

const ENTITY = 'transaction';

const POPULATE = [
  { path: 'createdBy', select: 'name email avatar' },
  { path: 'party.contact', select: 'name company email' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFilter(query = {}) {
  const filter = {};

  if (query.type) filter.type = query.type;
  if (query.category) filter.category = query.category;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
  if (query.tag) filter.tags = query.tag;

  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = query.from;
    if (query.to) filter.date.$lte = query.to;
  }

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ description: rx }, { 'party.name': rx }];
  }

  return filter;
}

export async function listTransactions(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  // Default to most-recent-first by transaction date unless an explicit sort is given.
  const effectiveSort = query.sort ? sort : { date: -1 };

  const [items, total] = await Promise.all([
    Transaction.find(filter).populate(POPULATE).sort(effectiveSort).skip(skip).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getTransaction(id) {
  const transaction = await Transaction.findById(id).populate(POPULATE);
  if (!transaction) throw ApiError.notFound('Transaction not found');
  return transaction;
}

export async function createTransaction(data, user) {
  const customFields = data.customFields
    ? await validateCustomFields(ENTITY, data.customFields)
    : {};

  const transaction = await Transaction.create({
    ...data,
    customFields,
    createdBy: user._id,
  });

  return Transaction.findById(transaction._id).populate(POPULATE);
}

const UPDATABLE = [
  'type', 'amount', 'currency', 'date', 'category', 'description',
  'paymentMethod', 'party', 'linkedTo', 'isRecurring', 'recurringNote', 'tags',
];

export async function updateTransaction(id, data) {
  const transaction = await Transaction.findById(id);
  if (!transaction) throw ApiError.notFound('Transaction not found');

  for (const f of UPDATABLE) if (data[f] !== undefined) transaction[f] = data[f];

  if (data.customFields !== undefined) {
    const merged = { ...transaction.customFields, ...data.customFields };
    transaction.customFields = await validateCustomFields(ENTITY, merged, { partial: true });
  }

  await transaction.save();
  return Transaction.findById(transaction._id).populate(POPULATE);
}

export async function deleteTransaction(id) {
  const transaction = await Transaction.findById(id);
  if (!transaction) throw ApiError.notFound('Transaction not found');
  await transaction.deleteOne();
  return { success: true };
}

/** Resolve the reporting window; defaults to the last 12 months (inclusive). */
function resolveRange(query = {}) {
  const to = query.to ? new Date(query.to) : new Date();
  let from;
  if (query.from) {
    from = new Date(query.from);
  } else {
    from = new Date(to);
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

/**
 * Aggregated finance summary for a date range:
 *   totals { income, expense, net }, byCategory, monthly (YYYY-MM buckets)
 *   and budgetUsage (expense spend vs each overlapping budget's category).
 */
export async function getSummary(query = {}) {
  const { from, to } = resolveRange(query);

  const [agg] = await Transaction.aggregate([
    { $match: { date: { $gte: from, $lte: to } } },
    {
      $facet: {
        totals: [{ $group: { _id: '$type', total: { $sum: '$amount' } } }],
        byCategory: [
          { $group: { _id: { category: '$category', type: '$type' }, total: { $sum: '$amount' } } },
          { $sort: { total: -1 } },
        ],
        monthly: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
              income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
              expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const totalsByType = Object.fromEntries((agg?.totals || []).map((t) => [t._id, t.total]));
  const income = totalsByType.income || 0;
  const expense = totalsByType.expense || 0;

  const byCategory = (agg?.byCategory || []).map((c) => ({
    category: c._id.category,
    type: c._id.type,
    total: c.total,
  }));

  const monthly = (agg?.monthly || []).map((m) => ({
    month: m._id,
    income: m.income,
    expense: m.expense,
  }));

  // Budgets whose active window overlaps the range ({ field: null } also
  // matches documents where the field is missing).
  const budgets = await Budget.find({
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: to } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: from } }] },
    ],
  }).sort({ createdAt: 1 });

  const expenseByCategory = new Map(
    byCategory.filter((c) => c.type === 'expense').map((c) => [c.category, c.total])
  );

  const budgetUsage = budgets.map((b) => {
    const spent = expenseByCategory.get(b.category) || 0;
    const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    return {
      budgetId: b._id,
      name: b.name,
      category: b.category,
      period: b.period,
      amount: b.amount,
      spent,
      pct,
    };
  });

  return {
    from,
    to,
    totals: { income, expense, net: income - expense },
    byCategory,
    monthly,
    budgetUsage,
  };
}

/** AI commentary over the summary: trends, anomalies and recommended actions. */
export async function aiInsights({ from, to } = {}) {
  const summary = await getSummary({ from, to });
  const ai = getAI();

  const fmt = (n) => Math.round(n).toLocaleString('en-IN');
  const topCategories = summary.byCategory.slice(0, 8);

  const lines = [
    `Period: ${summary.from.toDateString()} — ${summary.to.toDateString()}`,
    `Totals (INR): income ${fmt(summary.totals.income)}, expense ${fmt(summary.totals.expense)}, net ${fmt(summary.totals.net)}`,
    topCategories.length
      ? `Top categories: ${topCategories.map((c) => `${c.category} (${c.type}: ${fmt(c.total)})`).join(', ')}`
      : 'No transactions recorded in this period.',
    summary.monthly.length
      ? `Monthly trend:\n${summary.monthly.map((m) => `- ${m.month}: income ${fmt(m.income)}, expense ${fmt(m.expense)}`).join('\n')}`
      : null,
    summary.budgetUsage.length
      ? `Budget usage: ${summary.budgetUsage.map((b) => `${b.name} [${b.category}] ${fmt(b.spent)}/${fmt(b.amount)} (${b.pct}%)`).join('; ')}`
      : null,
  ].filter(Boolean);

  const result = await ai.complete({
    system:
      'You are a finance analyst for a small business. From the summary provided, ' +
      'highlight notable trends, unusual spending, budget overruns and cash-flow risks, ' +
      'then recommend 2-3 concrete actions. Use short bullet points.',
    messages: [{ role: 'user', content: lines.join('\n') }],
    maxTokens: 500,
  });

  return { insights: result.text, provider: result.provider, model: result.model };
}
