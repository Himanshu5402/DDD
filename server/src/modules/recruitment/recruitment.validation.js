import { z } from 'zod';
import { POSITION_STATUSES, POSITION_PRIORITIES } from '../../models/jobPosition.model.js';
import { CANDIDATE_STAGES } from '../../models/candidate.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

// --- Positions ----------------------------------------------------------------

export const listPositionsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  status: z.enum(POSITION_STATUSES).optional(),
  department: z.string().optional(),
  company: objectId.optional(),
});

// Creates write through to the HRMS (which assigns the JOB-## code) — the
// department is required because the HRMS opening model requires `dept`.
export const createPositionSchema = z.object({
  title: z.string().trim().min(1).max(300),
  department: z.string().trim().min(1, 'Department is required').max(200),
  company: objectId.nullable().optional(),
  openings: z.number().int().min(0).optional(),
  priority: z.enum(POSITION_PRIORITIES).optional(),
  status: z.enum(POSITION_STATUSES).optional(),
  openSince: z.coerce.date().optional(),
  targetHireDate: z.coerce.date().nullable().optional(),
  hiringManager: objectId.nullable().optional(),
  description: z.string().max(10000).optional(),
});

export const updatePositionSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  department: z.string().trim().max(200).optional(),
  company: objectId.nullable().optional(),
  openings: z.number().int().min(0).optional(),
  priority: z.enum(POSITION_PRIORITIES).optional(),
  status: z.enum(POSITION_STATUSES).optional(),
  targetHireDate: z.coerce.date().nullable().optional(),
  hiringManager: objectId.nullable().optional(),
  description: z.string().max(10000).optional(),
});

// --- Candidates ---------------------------------------------------------------

export const listCandidatesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  position: objectId.optional(),
  stage: z.enum(CANDIDATE_STAGES).optional(),
});

export const createCandidateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  email: z.string().trim().email().max(300).optional(),
  phone: z.string().trim().max(50).optional(),
  position: objectId,
  stage: z.enum(CANDIDATE_STAGES).optional(),
  source: z.string().trim().max(200).optional(),
  appliedAt: z.coerce.date().optional(),
  expectedJoining: z.coerce.date().nullable().optional(),
  rating: z.number().min(0).max(5).optional(),
  notes: z.string().max(10000).optional(),
});

export const updateCandidateSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  email: z.string().trim().email().max(300).optional(),
  phone: z.string().trim().max(50).optional(),
  position: objectId.optional(),
  stage: z.enum(CANDIDATE_STAGES).optional(),
  source: z.string().trim().max(200).optional(),
  expectedJoining: z.coerce.date().nullable().optional(),
  rating: z.number().min(0).max(5).optional(),
  notes: z.string().max(10000).optional(),
});

export const stageCandidateSchema = z.object({
  stage: z.enum(CANDIDATE_STAGES),
});
