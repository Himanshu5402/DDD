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

// --- HRMS employee write-through ----------------------------------------------
// Bodies travel to the HRMS /integration/employees* endpoints as-is, so the
// field names/enums are the HRMS employee shape (empId is assigned by the HRMS).

const ymdString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const empIdParamSchema = z.object({
  empId: z.string().trim().min(1).max(50),
});

const hrmsEmployeeFields = {
  name: z.string().trim().min(1).max(200),
  dept: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(300),
  phone: z.string().trim().max(50).optional(),
  join: ymdString.optional(),
  dob: ymdString.optional(),
  salary: z.number().min(0).optional(),
  gender: z.enum(['M', 'F', 'O']).optional(),
  status: z.enum(['Active', 'Inactive', 'Exited']).optional(),
  access: z
    .enum(['HR Admin', 'HR Representative', 'Finance Representative', 'Employee'])
    .optional(),
  managerId: z.string().trim().max(50).optional(),
};

export const createHrmsEmployeeSchema = z.object(hrmsEmployeeFields);
export const updateHrmsEmployeeSchema = z.object(hrmsEmployeeFields).partial();

export const teamSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
