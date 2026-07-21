import { z } from 'zod';
import { LEAVE_TYPES, LEAVE_REQUEST_STATUSES } from '../../models/leaveRequest.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

export const listRequestsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  leaveType: z.enum(LEAVE_TYPES).optional(),
  user: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const listBalancesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  user: objectId.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const summaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const createRequestSchema = z.object({
  user: objectId,
  leaveType: z.enum(LEAVE_TYPES),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  days: z.number().min(0.5),
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  reason: z.string().trim().max(2000).optional(),
});

export const updateRequestSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  days: z.number().min(0.5).optional(),
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  reason: z.string().trim().max(2000).optional(),
  approver: objectId.nullable().optional(),
});

export const decideRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});
