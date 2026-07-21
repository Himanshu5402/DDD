import { z } from 'zod';
import { PAYROLL_STATUSES } from '../../models/payrollPeriod.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM');

export const idParamSchema = z.object({ id: objectId });

const deptCostSchema = z.object({
  department: z.string().trim().max(200).optional(),
  headcount: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
});

export const listPeriodsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  month: monthStr.optional(),
  company: objectId.optional(),
  status: z.enum(PAYROLL_STATUSES).optional(),
});

export const createPeriodSchema = z.object({
  month: monthStr,
  company: objectId.nullable().optional(),
  status: z.enum(PAYROLL_STATUSES).optional(),
  currency: z.string().trim().max(10).optional(),
  totalCost: z.number().min(0).optional(),
  headcount: z.number().min(0).optional(),
  byDepartment: z.array(deptCostSchema).optional(),
  reimbursementsPending: z.number().min(0).optional(),
  reimbursementsAmount: z.number().min(0).optional(),
});

export const updatePeriodSchema = z.object({
  status: z.enum(PAYROLL_STATUSES).optional(),
  currency: z.string().trim().max(10).optional(),
  totalCost: z.number().min(0).optional(),
  headcount: z.number().min(0).optional(),
  byDepartment: z.array(deptCostSchema).optional(),
  reimbursementsPending: z.number().min(0).optional(),
  reimbursementsAmount: z.number().min(0).optional(),
});
