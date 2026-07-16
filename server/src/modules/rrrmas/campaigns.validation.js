import { z } from 'zod';
import { CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES } from '../../models/campaign.model.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const metricsSchema = z.object({
  reach: z.number().min(0).optional(),
  leads: z.number().min(0).optional(),
  conversions: z.number().min(0).optional(),
});

export const idParamSchema = z.object({ id: objectId });

export const listCampaignsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  channel: z.enum(CAMPAIGN_CHANNELS).optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  channel: z.enum(CAMPAIGN_CHANNELS).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  budget: z.number().min(0).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  metrics: metricsSchema.optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  channel: z.enum(CAMPAIGN_CHANNELS).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  budget: z.number().min(0).optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  metrics: metricsSchema.optional(),
});
