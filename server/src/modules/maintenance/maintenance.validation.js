import { z } from 'zod';
import { ASSET_STATUSES } from '../../models/asset.model.js';
import { MAINTENANCE_TYPES, MAINTENANCE_STATUSES } from '../../models/maintenanceRecord.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({ id: objectId });

// --- Assets ------------------------------------------------------------------

export const listAssetsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  category: z.string().optional(),
  product: objectId.optional(),
});

const amcSchema = z.object({
  provider: z.string().trim().max(200).optional(),
  validUntil: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export const createAssetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(50).optional(),
  product: objectId.nullable().optional(),
  category: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  purchaseDate: z.coerce.date().optional(),
  purchaseCost: z.number().min(0).optional(),
  warrantyUntil: z.coerce.date().optional(),
  amc: amcSchema.optional(),
  specs: z.record(z.any()).optional(),
  assignedTo: objectId.nullable().optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateAssetSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  product: objectId.nullable().optional(),
  category: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  purchaseCost: z.number().min(0).optional(),
  warrantyUntil: z.coerce.date().nullable().optional(),
  amc: amcSchema.optional(),
  specs: z.record(z.any()).optional(),
  assignedTo: objectId.nullable().optional(),
  customFields: z.record(z.any()).optional(),
});

// --- Maintenance records -------------------------------------------------------

export const listRecordsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  asset: objectId.optional(),
  type: z.enum(MAINTENANCE_TYPES).optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const partUsedSchema = z.object({
  name: z.string().trim().min(1).max(200),
  qty: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
});

export const createRecordSchema = z.object({
  asset: objectId,
  type: z.enum(MAINTENANCE_TYPES),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  scheduledFor: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  technician: z.string().trim().max(200).optional(),
  performedBy: objectId.nullable().optional(),
  cost: z.number().min(0).optional(),
  notes: z.string().max(5000).optional(),
  partsUsed: z.array(partUsedSchema).optional(),
});

export const updateRecordSchema = z.object({
  type: z.enum(MAINTENANCE_TYPES).optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  scheduledFor: z.coerce.date().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  technician: z.string().trim().max(200).optional(),
  performedBy: objectId.nullable().optional(),
  cost: z.number().min(0).optional(),
  notes: z.string().max(5000).optional(),
  partsUsed: z.array(partUsedSchema).optional(),
});

// --- Upcoming ------------------------------------------------------------------

export const upcomingSchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional(),
});
