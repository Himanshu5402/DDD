import { z } from 'zod';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../../models/supportTicket.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const slaSchema = z.object({
  dueAt: z.coerce.date().nullable().optional(),
  breached: z.boolean().optional(),
});

export const idParamSchema = z.object({ id: objectId });

export const listTicketsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  customer: objectId.optional(),
  assignee: objectId.optional(),
});

export const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  description: z.string().max(10000).optional(),
  customer: objectId.optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  sla: slaSchema.optional(),
  assignee: objectId.optional(),
  comment: z.string().trim().max(5000).optional(),
});

export const updateTicketSchema = z.object({
  subject: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  customer: objectId.nullable().optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  sla: slaSchema.optional(),
  assignee: objectId.nullable().optional(),
  comment: z.string().trim().max(5000).optional(),
});
