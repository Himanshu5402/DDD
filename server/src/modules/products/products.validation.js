import { z } from 'zod';
import {
  PRODUCT_STATUSES,
  ROADMAP_STATUSES,
} from '../../models/product.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const urlOrEmpty = z.union([z.literal(''), z.string().trim().url().max(2000)]);

// Categories are an open set (built-ins + admin-added) — validate the slug
// shape only; the service resolves/auto-registers unknown categories.
const categorySlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_ -]{0,59}$/, 'Invalid category');

export const createCategorySchema = z.object({
  label: z.string().trim().min(2).max(40),
});

// Free-form name/value rows added in the product form ("Add field").
const specItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  value: z.string().trim().max(1000).optional().default(''),
});
const specsSchema = z.array(specItemSchema).max(200);

export const idParamSchema = z.object({ id: objectId });
export const itemParamSchema = z.object({ id: objectId, itemId: objectId });

export const listProductsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  category: categorySlug.optional(),
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
  category: categorySlug.optional(),
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
  specs: specsSchema.optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  sku: z.string().trim().max(100).nullable().optional(),
  description: z.string().max(10000).optional(),
  category: categorySlug.optional(),
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
  specs: specsSchema.optional(),
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
