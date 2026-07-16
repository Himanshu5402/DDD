import { z } from 'zod';
import { PROJECT_STATUSES } from '../../models/project.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

export const listProjectsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  customer: objectId.optional(),
  manager: objectId.optional(),
  tag: z.string().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10000).optional(),
  customer: objectId.optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  budget: z.number().min(0).optional(),
  manager: objectId.optional(),
  team: z.array(objectId).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string().trim()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  customer: objectId.nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  budget: z.number().min(0).optional(),
  manager: objectId.nullable().optional(),
  team: z.array(objectId).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string().trim()).optional(),
  customFields: z.record(z.any()).optional(),
});
