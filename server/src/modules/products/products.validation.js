import { z } from 'zod';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  ROADMAP_STATUSES,
} from '../../models/product.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const urlOrEmpty = z.union([z.literal(''), z.string().trim().url().max(2000)]);

export const idParamSchema = z.object({ id: objectId });
export const itemParamSchema = z.object({ id: objectId, itemId: objectId });

export const listProductsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
});

const versionItemSchema = z.object({
  version: z.string().trim().min(1).max(100),
  releasedAt: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
});

const roadmapItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  plannedFor: z.string().trim().max(100).optional(),
  status: z.enum(ROADMAP_STATUSES).optional(),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(300),
  sku: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(10000).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  currentVersion: z.string().trim().max(100).optional(),
  versions: z.array(versionItemSchema).optional(),
  docsUrl: urlOrEmpty.optional(),
  trainingUrl: urlOrEmpty.optional(),
  supportNotes: z.string().max(10000).optional(),
  price: z.number().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
  upgradeRoadmap: z.array(roadmapItemSchema).optional(),
  tags: z.array(z.string().trim()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  sku: z.string().trim().max(100).nullable().optional(),
  description: z.string().max(10000).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  currentVersion: z.string().trim().max(100).optional(),
  versions: z.array(versionItemSchema).optional(),
  docsUrl: urlOrEmpty.optional(),
  trainingUrl: urlOrEmpty.optional(),
  supportNotes: z.string().max(10000).optional(),
  price: z.number().min(0).nullable().optional(),
  currency: z.string().trim().max(10).optional(),
  upgradeRoadmap: z.array(roadmapItemSchema).optional(),
  tags: z.array(z.string().trim()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const addVersionSchema = z.object({
  version: z.string().trim().min(1).max(100),
  notes: z.string().max(5000).optional(),
});

export const addRoadmapItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  plannedFor: z.string().trim().max(100).optional(),
});

export const updateRoadmapItemSchema = z.object({
  status: z.enum(ROADMAP_STATUSES),
});
