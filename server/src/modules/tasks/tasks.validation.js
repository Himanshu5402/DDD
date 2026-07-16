import { z } from 'zod';
import { TASK_STATUSES, TASK_PRIORITIES, RECURRENCE_FREQUENCIES } from '../../models/task.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const boolish = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const idParamSchema = z.object({ id: objectId });

export const listTasksSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignee: objectId.optional(),
  tag: z.string().optional(),
  parent: objectId.optional(),
  company: objectId.optional(),
  goal: objectId.optional(),
  project: objectId.optional(),
  includeSubtasks: boolish,
  mine: boolish,
  search: z.string().optional(),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
});

export const boardSchema = z.object({
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignee: objectId.optional(),
  tag: z.string().optional(),
  company: objectId.optional(),
  mine: boolish,
  search: z.string().optional(),
});

const recurrenceSchema = z.object({
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  interval: z.number().int().positive().optional(),
  until: z.coerce.date().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignees: z.array(objectId).optional(),
  watchers: z.array(objectId).optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  tags: z.array(z.string().trim()).optional(),
  parent: objectId.optional(),
  company: objectId.optional(),
  goal: objectId.optional(),
  project: objectId.optional(),
  estimatedMinutes: z.number().int().min(0).optional(),
  recurrence: recurrenceSchema.optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignees: z.array(objectId).optional(),
  watchers: z.array(objectId).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  tags: z.array(z.string().trim()).optional(),
  company: objectId.nullable().optional(),
  goal: objectId.nullable().optional(),
  project: objectId.nullable().optional(),
  estimatedMinutes: z.number().int().min(0).optional(),
  recurrence: recurrenceSchema.optional(),
  customFields: z.record(z.any()).optional(),
});

export const moveSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  order: z.number().int().min(0).optional(),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(5000) });
export const checklistItemSchema = z.object({ text: z.string().trim().min(1).max(500) });
export const itemParamSchema = z.object({ id: objectId, itemId: objectId });
export const logTimeSchema = z.object({
  minutes: z.number().int().positive().max(24 * 60),
  note: z.string().max(500).optional(),
});
