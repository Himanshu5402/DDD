import { z } from 'zod';
import { RENEWAL_STATUSES } from '../../models/renewal.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

export const listRenewalsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(RENEWAL_STATUSES).optional(),
  customer: objectId.optional(),
});

export const createRenewalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  customer: objectId.optional(),
  product: objectId.optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
  dueDate: z.coerce.date().optional(),
  status: z.enum(RENEWAL_STATUSES).optional(),
  autoRenew: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

export const updateRenewalSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  customer: objectId.nullable().optional(),
  product: objectId.nullable().optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  status: z.enum(RENEWAL_STATUSES).optional(),
  autoRenew: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});
