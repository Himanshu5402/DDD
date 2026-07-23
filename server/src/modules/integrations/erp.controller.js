import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { handleEvent, runBootstrapSync, getStatus } from './erpSync.service.js';

/** POST /integrations/erp/events — one pushed ERP event → idempotent upsert. */
export const events = asyncHandler(async (req, res) => {
  const { event, payload } = req.body;
  const result = await handleEvent(event, payload || {});
  return ApiResponse.ok(res, result, result.ignored ? 'Event ignored' : 'Event processed');
});

/** GET /integrations/erp/status — sync health for the owner console / ERP. */
export const status = asyncHandler(async (_req, res) => {
  const result = await getStatus();
  return ApiResponse.ok(res, result, 'ERP integration status');
});

/** POST /integrations/erp/sync — owner-triggered full bootstrap pull. */
export const sync = asyncHandler(async (_req, res) => {
  const result = await runBootstrapSync();
  return ApiResponse.ok(res, result, 'ERP sync complete');
});
