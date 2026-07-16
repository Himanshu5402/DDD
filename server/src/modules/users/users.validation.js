import { z } from 'zod';

// Mongo ObjectId (24 hex chars).
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  role: objectId.optional(),
  company: objectId.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const idParamSchema = z.object({ id: objectId });

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  roles: z.array(objectId).optional(),
  phone: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  company: objectId.optional(),
  mustChangePassword: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  company: objectId.nullable().optional(),
  avatar: z.string().optional(),
  roles: z.array(objectId).optional(),
  customFields: z.record(z.any()).optional(),
});

export const setStatusSchema = z.object({ isActive: z.boolean() });

export const assignRolesSchema = z.object({ roles: z.array(objectId) });

export const resetPasswordSchema = z.object({ newPassword: z.string().min(8).max(128) });
