import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

export const listRolesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().optional(),
  description: z.string().max(300).optional(),
  permissions: z.array(objectId).optional(),
  level: z.number().int().min(0).max(100).optional(),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  slug: z.string().trim().optional(),
  description: z.string().max(300).optional(),
  permissions: z.array(objectId).optional(),
  level: z.number().int().min(0).max(100).optional(),
});

export const setPermissionsSchema = z.object({ permissions: z.array(objectId) });
