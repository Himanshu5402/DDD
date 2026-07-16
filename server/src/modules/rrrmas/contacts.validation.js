import { z } from 'zod';
import { CONTACT_TYPES, CONTACT_STATUSES } from '../../models/contact.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

export const listContactsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  type: z.enum(CONTACT_TYPES).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  owner: objectId.optional(),
  tag: z.string().optional(),
});

export const createContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(CONTACT_TYPES).optional(),
  company: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(40).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  source: z.string().trim().max(120).optional(),
  owner: objectId.optional(),
  tags: z.array(z.string().trim()).optional(),
  notes: z.string().max(5000).optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateContactSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: z.enum(CONTACT_TYPES).optional(),
  company: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().max(40).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  source: z.string().trim().max(120).optional(),
  owner: objectId.nullable().optional(),
  tags: z.array(z.string().trim()).optional(),
  notes: z.string().max(5000).optional(),
  customFields: z.record(z.any()).optional(),
});
