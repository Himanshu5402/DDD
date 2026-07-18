import { z } from 'zod';
import { REPORT_MOODS, ATTACHMENT_TYPES } from '../../models/dailyReport.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

const attachmentSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  key: z.string().trim().max(500).optional(),
  type: z.enum(ATTACHMENT_TYPES),
  name: z.string().trim().max(300).optional(),
  size: z.number().int().min(0).optional(),
  mimeType: z.string().trim().max(150).optional(),
});

const meetingSchema = z.object({
  title: z.string().trim().min(1).max(300),
  durationMinutes: z.number().int().min(0).max(24 * 60).optional(),
});

const gitCommitSchema = z.object({
  repo: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(500),
  hash: z.string().trim().max(64).optional(),
});

export const submitReportSchema = z.object({
  date: z.coerce.date().optional(),
  workDone: z.string().trim().min(1).max(10000),
  tomorrowPlan: z.string().max(5000).optional(),
  blockers: z.string().max(5000).optional(),
  hoursWorked: z.number().min(0).max(24).optional(),
  meetings: z.array(meetingSchema).max(50).optional(),
  gitCommits: z.array(gitCommitSchema).max(100).optional(),
  tasksWorked: z.array(objectId).max(100).optional(),
  remarks: z.string().max(5000).optional(),
  mood: z.enum(REPORT_MOODS).optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

// Manager/admin approving a report — no body needed.
export const approveSchema = z.object({}).optional();

// Rejecting requires a reason so the author knows what to fix.
export const rejectSchema = z.object({
  reason: z.string().trim().min(3, 'Please give a reason').max(2000),
});

export const listMineSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const teamQuerySchema = z.object({
  date: z.coerce.date().optional(),
});

export const digestSchema = z.object({
  date: z.coerce.date().optional(),
});
