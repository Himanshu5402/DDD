import { z } from 'zod';
import { GOAL_TYPES, GOAL_STATUSES } from '../../models/goal.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const boolish = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const idParamSchema = z.object({ id: objectId });
export const itemParamSchema = z.object({ id: objectId, itemId: objectId });

export const listGoalsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  type: z.enum(GOAL_TYPES).optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  owner: objectId.optional(),
  parent: objectId.optional(),
  includeChildren: boolish,
  mine: boolish,
  search: z.string().optional(),
  tag: z.string().optional(),
});

const targetSchema = z.object({
  metric: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(50).optional(),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().optional(),
});

export const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10000).optional(),
  type: z.enum(GOAL_TYPES).optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  owner: objectId.optional(),
  collaborators: z.array(objectId).optional(),
  parent: objectId.optional(),
  startDate: z.coerce.date().optional(),
  targetDate: z.coerce.date().optional(),
  progress: z.number().min(0).max(100).optional(),
  target: targetSchema.optional(),
  tags: z.array(z.string().trim()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateGoalSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  type: z.enum(GOAL_TYPES).optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  owner: objectId.nullable().optional(),
  collaborators: z.array(objectId).optional(),
  startDate: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  progress: z.number().min(0).max(100).optional(),
  target: targetSchema.optional(),
  tags: z.array(z.string().trim()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const progressSchema = z.object({
  progress: z.number().min(0).max(100).optional(),
  currentValue: z.number().optional(),
});

export const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(300),
  dueDate: z.coerce.date().optional(),
});

export const checklistItemSchema = z.object({ text: z.string().trim().min(1).max(500) });
