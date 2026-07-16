import { z } from 'zod';
import { ATTENDANCE_STATUSES, RECORD_SOURCES } from '../../models/employeeRecord.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

export const listRecordsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  user: objectId.optional(),
  attendance: z.enum(ATTENDANCE_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const kpiSchema = z.object({
  name: z.string().trim().min(1).max(100),
  score: z.number().min(0).max(100),
});

export const createRecordSchema = z.object({
  user: objectId,
  date: z.coerce.date(),
  attendance: z.enum(ATTENDANCE_STATUSES).optional(),
  hoursWorked: z.number().min(0).max(24).optional(),
  kpis: z.array(kpiSchema).max(20).optional(),
  productivityScore: z.number().min(0).max(100).optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  notes: z.string().max(5000).optional(),
  source: z.enum(RECORD_SOURCES).optional(),
});

export const updateRecordSchema = z.object({
  user: objectId.optional(),
  date: z.coerce.date().optional(),
  attendance: z.enum(ATTENDANCE_STATUSES).optional(),
  hoursWorked: z.number().min(0).max(24).optional(),
  kpis: z.array(kpiSchema).max(20).optional(),
  productivityScore: z.number().min(0).max(100).optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  notes: z.string().max(5000).optional(),
  source: z.enum(RECORD_SOURCES).optional(),
});

export const summarySchema = z.object({
  user: objectId,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const teamSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
