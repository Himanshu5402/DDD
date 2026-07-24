import Transaction, { PAYMENT_METHODS } from '../../models/transaction.model.js';
import FinanceOption from '../../models/financeOption.model.js';
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
    filter.$or = [
      { description: rx },
      { 'party.name': rx },
      { 'extraFields.name': rx },
      { 'extraFields.value': rx },
    ];
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

// ---------------------------------------------------------------------------
// Dynamic options — categories & payment methods (built-ins + admin-added).

const BUILT_IN_TYPES = Object.freeze({
  income: { label: 'Income', direction: 'in' },
  expense: { label: 'Expense', direction: 'out' },
});

const BUILT_IN_METHODS = Object.freeze({
  cash: { label: 'Cash', refLabel: '' }, // cash-like: no reference id
  bank: { label: 'Bank transfer', refLabel: 'Payment ID — Bank / UTR ref' },
  upi: { label: 'UPI', refLabel: 'Payment ID — UPI ID' },
  card: { label: 'Card', refLabel: 'Payment ID — Card / auth ref' },
  cheque: { label: 'Cheque', refLabel: 'Payment ID — Cheque no.' },
  invoice: { label: 'Invoice', refLabel: 'Payment ID — Invoice no.' },
  other: { label: 'Other', refLabel: 'Payment ID' },
});

const slugifyOption = (label) =>
  String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

const titleizeOption = (key) =>
  key.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Categories + methods + types for the Finance dropdowns. */
export async function listFinanceOptions() {
  const [rows, usedCategories, usedMethods, usedTypes] = await Promise.all([
    FinanceOption.find().lean(),
    Transaction.distinct('category'),
    Transaction.distinct('paymentMethod'),
    Transaction.distinct('type'),
  ]);

  const types = new Map();
  for (const [k, v] of Object.entries(BUILT_IN_TYPES)) types.set(k, { key: k, ...v, builtIn: true });
  for (const r of rows.filter((r) => r.kind === 'type')) {
    types.set(r.key, { key: r.key, label: r.label, direction: r.direction || 'out', builtIn: false });
  }
  for (const k of usedTypes) {
    if (k && !types.has(k)) types.set(k, { key: k, label: titleizeOption(k), direction: 'out', builtIn: false });
  }

  const categories = new Map();
  categories.set('uncategorized', { key: 'uncategorized', label: 'Uncategorized' });
  for (const r of rows.filter((r) => r.kind === 'category')) {
    categories.set(r.key, { key: r.key, label: r.label });
  }
  for (const k of usedCategories) {
    if (k && !categories.has(k)) categories.set(k, { key: k, label: titleizeOption(k) });
  }

  const methods = new Map();
  for (const k of PAYMENT_METHODS) methods.set(k, { key: k, ...BUILT_IN_METHODS[k], builtIn: true });
  for (const r of rows.filter((r) => r.kind === 'method')) {
    methods.set(r.key, { key: r.key, label: r.label, refLabel: r.refLabel ?? 'Payment ID', builtIn: false });
  }
  for (const k of usedMethods) {
    if (k && !methods.has(k)) methods.set(k, { key: k, label: titleizeOption(k), refLabel: 'Payment ID', builtIn: false });
  }

  const sortOpts = (a, b) =>
    (a.key === 'uncategorized' || a.key === 'other') - (b.key === 'uncategorized' || b.key === 'other') ||
    a.label.localeCompare(b.label);
  return {
    categories: [...categories.values()].sort(sortOpts),
    methods: [...methods.values()].sort(sortOpts),
    // Built-ins first (income, expense), then custom types alphabetically.
    types: [...types.values()].sort((a, b) => (b.builtIn === true) - (a.builtIn === true) || a.label.localeCompare(b.label)),
  };
}

/** Resolve a type key to its accounting direction ('in' | 'out'). */
async function typeDirection(typeKey) {
  if (BUILT_IN_TYPES[typeKey]) return BUILT_IN_TYPES[typeKey].direction;
  const row = await FinanceOption.findOne({ kind: 'type', key: typeKey }).lean();
  return row?.direction === 'in' ? 'in' : 'out';
}

/** Explicit add from the UI — idempotent on {kind, slug(label)}. */
export async function addFinanceOption({ kind, label, refLabel, direction }, userId) {
  const key = slugifyOption(label);
  if (!key) throw ApiError.badRequest('Invalid name');
  if (kind === 'method' && BUILT_IN_METHODS[key]) {
    return { key, ...BUILT_IN_METHODS[key], builtIn: true };
  }
  if (kind === 'type' && BUILT_IN_TYPES[key]) {
    return { key, ...BUILT_IN_TYPES[key], builtIn: true };
  }
  if (kind === 'category' && key === 'uncategorized') {
    return { key, label: 'Uncategorized' };
  }
  const doc = await FinanceOption.findOneAndUpdate(
    { kind, key },
    {
      $setOnInsert: {
        kind,
        key,
        label: String(label).trim(),
        refLabel: kind === 'method' ? (refLabel ?? 'Payment ID') : '',
        direction: kind === 'type' ? (direction === 'in' ? 'in' : 'out') : 'out',
        createdBy: userId || null,
      },
    },
    { upsert: true, new: true }
  ).lean();
  return { key: doc.key, label: doc.label, refLabel: doc.refLabel, direction: doc.direction, builtIn: false };
}

/** Auto-register unknown categories/methods on save so dropdowns learn them. */
async function ensureFinanceOption(kind, value, userId) {
  if (!value) return undefined;
  const key = slugifyOption(value);
  if (!key) return undefined;
  const isKnownBuiltIn =
    kind === 'method' ? Boolean(BUILT_IN_METHODS[key])
    : kind === 'type' ? Boolean(BUILT_IN_TYPES[key])
    : key === 'uncategorized';
  if (!isKnownBuiltIn) {
    await FinanceOption.updateOne(
      { kind, key },
      {
        $setOnInsert: {
          kind,
          key,
          label: titleizeOption(key),
          refLabel: kind === 'method' ? 'Payment ID' : '',
          createdBy: userId || null,
        },
      },
      { upsert: true }
    );
  }
  return key;
}

/** True when the method carries no reference id (cash-like) — clears paymentRef. */
async function methodHasNoRef(methodKey) {
  if (!methodKey) return false;
  if (BUILT_IN_METHODS[methodKey]) return BUILT_IN_METHODS[methodKey].refLabel === '';
  const row = await FinanceOption.findOne({ kind: 'method', key: methodKey }).lean();
  return Boolean(row) && (row.refLabel ?? '') === '';
}

export async function createTransaction(data, user) {
  const customFields = data.customFields
    ? await validateCustomFields(ENTITY, data.customFields)
    : {};

  if (data.category !== undefined) data.category = await ensureFinanceOption('category', data.category, user._id);
  if (data.paymentMethod !== undefined) data.paymentMethod = await ensureFinanceOption('method', data.paymentMethod, user._id);
  data.type = await ensureFinanceOption('type', data.type, user._id);

  const transaction = await Transaction.create({
    ...data,
    direction: await typeDirection(data.type),
    // Cash-like methods never carry a reference id.
    paymentRef: (await methodHasNoRef(data.paymentMethod)) ? '' : data.paymentRef,
    // A custom method label only applies to the 'other' method.
    paymentMethodOther: data.paymentMethod === 'other' ? data.paymentMethodOther : '',
    customFields,
    createdBy: user._id,
  });

  return Transaction.findById(transaction._id).populate(POPULATE);
}

/**
 * Distinct custom payment-method labels the user has saved so far (method
 * 'other' with a non-empty label). Powers the reusable dropdown so a custom
 * method typed once can be picked again without re-typing.
 */
export async function listCustomPaymentMethods() {
  const values = await Transaction.distinct('paymentMethodOther', {
    paymentMethod: 'other',
    paymentMethodOther: { $ne: '' },
  });
  return values.filter(Boolean).sort((a, b) => a.localeCompare(b));
}

const UPDATABLE = [
  'type', 'amount', 'currency', 'date', 'category', 'description',
  'paymentMethod', 'paymentRef', 'paymentMethodOther', 'party', 'linkedTo', 'isRecurring', 'recurringNote', 'tags',
  'extraFields',
];

export async function updateTransaction(id, data) {
  const transaction = await Transaction.findById(id);
  if (!transaction) throw ApiError.notFound('Transaction not found');

  if (data.category !== undefined) data.category = await ensureFinanceOption('category', data.category, transaction.createdBy);
  if (data.paymentMethod !== undefined) data.paymentMethod = await ensureFinanceOption('method', data.paymentMethod, transaction.createdBy);
  if (data.type !== undefined) data.type = await ensureFinanceOption('type', data.type, transaction.createdBy);

  for (const f of UPDATABLE) if (data[f] !== undefined) transaction[f] = data[f];

  // Keep the accounting direction in sync with the (possibly changed) type.
  transaction.direction = await typeDirection(transaction.type);

  // Cash-like methods never carry a payment reference — clear it whenever the
  // (possibly just-updated) method resolves to one.
  if (await methodHasNoRef(transaction.paymentMethod)) transaction.paymentRef = '';
  // The custom label only applies to 'other'.
  if (transaction.paymentMethod !== 'other') transaction.paymentMethodOther = '';

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
        // Direction-based so admin-added types (kind 'type', direction in/out)
        // roll into the right bucket automatically.
        totals: [{ $group: { _id: '$direction', total: { $sum: '$amount' } } }],
        byCategory: [
          {
            $group: {
              _id: { category: '$category', type: '$type', direction: '$direction' },
              total: { $sum: '$amount' },
            },
          },
          { $sort: { total: -1 } },
        ],
        monthly: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
              income: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, '$amount', 0] } },
              expense: { $sum: { $cond: [{ $ne: ['$direction', 'in'] }, '$amount', 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const totalsByDirection = Object.fromEntries((agg?.totals || []).map((t) => [t._id, t.total]));
  const income = totalsByDirection.in || 0;
  const expense = totalsByDirection.out || 0;

  const byCategory = (agg?.byCategory || []).map((c) => ({
    category: c._id.category,
    type: c._id.type,
    direction: c._id.direction || 'out',
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

  // Budget spend = every money-out category total (custom out-types included).
  const expenseByCategory = new Map();
  for (const c of byCategory) {
    if (c.direction !== 'in') {
      expenseByCategory.set(c.category, (expenseByCategory.get(c.category) || 0) + c.total);
    }
  }

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
