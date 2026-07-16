import { z } from 'zod';
import { CUSTOM_FIELD_TYPES } from '../../models/customField.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const optionSchema = z.object({ label: z.string(), value: z.string() });

const validationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
  })
  .optional();

export const listQuerySchema = z.object({
  entityType: z.string().min(1),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const idParamSchema = z.object({ id: objectId });

export const createSchema = z.object({
  entityType: z.string().trim().min(1).toLowerCase(),
  key: z
    .string()
    .trim()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Key must start with a letter and be alphanumeric/underscore'),
  label: z.string().trim().min(1),
  type: z.enum(CUSTOM_FIELD_TYPES),
  required: z.boolean().optional(),
  defaultValue: z.any().optional(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(optionSchema).optional(),
  validation: validationSchema,
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateSchema = z.object({
  label: z.string().trim().min(1).optional(),
  type: z.enum(CUSTOM_FIELD_TYPES).optional(),
  required: z.boolean().optional(),
  defaultValue: z.any().optional(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(optionSchema).optional(),
  validation: validationSchema,
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
