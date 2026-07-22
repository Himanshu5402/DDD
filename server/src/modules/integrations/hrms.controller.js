import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { handleEvent, runBootstrapSync, getStatus } from './hrmsSync.service.js';

/** POST /integrations/hrms/events — one pushed HRMS event → idempotent upsert. */
export const events = asyncHandler(async (req, res) => {
  const { event, payload } = req.body;
  const result = await handleEvent(event, payload || {});
  return ApiResponse.ok(res, result, result.ignored ? 'Event ignored' : 'Event processed');
});

/** GET /integrations/hrms/status — sync health for the owner console / HRMS. */
export const status = asyncHandler(async (_req, res) => {
  const result = await getStatus();
  return ApiResponse.ok(res, result, 'HRMS integration status');
});

/** POST /integrations/hrms/sync — owner-triggered full bootstrap pull. */
export const sync = asyncHandler(async (_req, res) => {
  const result = await runBootstrapSync();
  return ApiResponse.ok(res, result, 'HRMS sync complete');
});
