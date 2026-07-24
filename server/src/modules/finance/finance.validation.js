import { z } from 'zod';
import { TRANSACTION_TYPES, LINKABLE_MODELS } from '../../models/transaction.model.js';
import { FINANCE_OPTION_KINDS } from '../../models/financeOption.model.js';
import { BUDGET_PERIODS } from '../../models/budget.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// Payment methods / categories are an open set (built-ins + admin-added) —
// validate the slug shape only; the service auto-registers unknown values.
const optionSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_ -]{0,59}$/, 'Invalid value');

export const createFinanceOptionSchema = z.object({
  kind: z.enum(FINANCE_OPTION_KINDS),
  label: z.string().trim().min(2).max(40),
  // Methods only: label for the Payment ID field; empty string = cash-like
  // (no reference id, field hidden).
  refLabel: z.string().trim().max(60).optional(),
  // Types only: money-in (income-like) or money-out (expense-like).
  direction: z.enum(['in', 'out']).optional(),
});

export const idParamSchema = z.object({ id: objectId });

// Hard cap on any monetary value. `.finite()` rejects Infinity / -Infinity / NaN
// (e.g. the string 'Infinity' or '1e308' coercing to a non-finite number), and
// the max keeps one bad row from poisoning every /finance/summary aggregate.
const MAX_MONEY = 1e12;
const money = (min) => z.coerce.number().finite().min(min).max(MAX_MONEY);

// --- Transactions ---

export const listTransactionsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  type: optionSlug.optional(),
  category: z.string().optional(),
  paymentMethod: optionSlug.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
});

const partySchema = z.object({
  name: z.string().trim().max(300).optional(),
  contact: objectId.nullable().optional(),
});

// Free-form "Add field" rows (mirrors Product.specs) — name/value string pairs.
const extraFieldsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120),
      value: z.string().trim().max(2000).optional().default(''),
    })
  )
  .max(100);

const linkedToSchema = z.object({
  model: z.enum(LINKABLE_MODELS).optional(),
  id: objectId.nullable().optional(),
});

export const createTransactionSchema = z.object({
  type: optionSlug,
  amount: money(0.01),
  currency: z.string().trim().max(10).optional(),
  date: z.coerce.date().optional(),
  category: z.string().trim().max(120).optional(),
  description: z.string().max(5000).optional(),
  paymentMethod: optionSlug.optional(),
  paymentRef: z.string().trim().max(140).optional(),
  paymentMethodOther: z.string().trim().max(120).optional(),
  party: partySchema.optional(),
  linkedTo: linkedToSchema.optional(),
  isRecurring: z.boolean().optional(),
  recurringNote: z.string().max(1000).optional(),
  tags: z.array(z.string().trim()).optional(),
  extraFields: extraFieldsSchema.optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateTransactionSchema = z.object({
  type: optionSlug.optional(),
  amount: money(0.01).optional(),
  currency: z.string().trim().max(10).optional(),
  date: z.coerce.date().optional(),
  category: z.string().trim().max(120).optional(),
  description: z.string().max(5000).optional(),
  paymentMethod: optionSlug.optional(),
  paymentRef: z.string().trim().max(140).optional(),
  paymentMethodOther: z.string().trim().max(120).optional(),
  party: partySchema.optional(),
  linkedTo: linkedToSchema.optional(),
  isRecurring: z.boolean().optional(),
  recurringNote: z.string().max(1000).optional(),
  tags: z.array(z.string().trim()).optional(),
  extraFields: extraFieldsSchema.optional(),
  customFields: z.record(z.any()).optional(),
});

// --- Budgets ---

export const listBudgetsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  category: z.string().optional(),
  period: z.enum(BUDGET_PERIODS).optional(),
  search: z.string().optional(),
});

export const createBudgetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  period: z.enum(BUDGET_PERIODS).optional(),
  amount: money(0),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  extraFields: extraFieldsSchema.optional(),
});

export const updateBudgetSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  period: z.enum(BUDGET_PERIODS).optional(),
  amount: money(0).optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
  extraFields: extraFieldsSchema.optional(),
});

// --- Summary / AI insights ---

export const summaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const aiInsightsSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
