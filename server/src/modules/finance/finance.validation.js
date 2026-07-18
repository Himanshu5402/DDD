import { z } from 'zod';
import { TRANSACTION_TYPES, PAYMENT_METHODS, LINKABLE_MODELS } from '../../models/transaction.model.js';
import { BUDGET_PERIODS } from '../../models/budget.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

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
  type: z.enum(TRANSACTION_TYPES).optional(),
  category: z.string().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
});

const partySchema = z.object({
  name: z.string().trim().max(300).optional(),
  contact: objectId.nullable().optional(),
});

const linkedToSchema = z.object({
  model: z.enum(LINKABLE_MODELS).optional(),
  id: objectId.nullable().optional(),
});

export const createTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount: money(0.01),
  currency: z.string().trim().max(10).optional(),
  date: z.coerce.date().optional(),
  category: z.string().trim().max(120).optional(),
  description: z.string().max(5000).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  paymentRef: z.string().trim().max(140).optional(),
  paymentMethodOther: z.string().trim().max(120).optional(),
  party: partySchema.optional(),
  linkedTo: linkedToSchema.optional(),
  isRecurring: z.boolean().optional(),
  recurringNote: z.string().max(1000).optional(),
  tags: z.array(z.string().trim()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  amount: money(0.01).optional(),
  currency: z.string().trim().max(10).optional(),
  date: z.coerce.date().optional(),
  category: z.string().trim().max(120).optional(),
  description: z.string().max(5000).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  paymentRef: z.string().trim().max(140).optional(),
  paymentMethodOther: z.string().trim().max(120).optional(),
  party: partySchema.optional(),
  linkedTo: linkedToSchema.optional(),
  isRecurring: z.boolean().optional(),
  recurringNote: z.string().max(1000).optional(),
  tags: z.array(z.string().trim()).optional(),
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
});

export const updateBudgetSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  period: z.enum(BUDGET_PERIODS).optional(),
  amount: money(0).optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
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
