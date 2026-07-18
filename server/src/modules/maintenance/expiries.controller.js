import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './expiries.service.js';

/** Notify connected clients that maintenance data changed so they can refetch. */
function emitChange(type, id) {
  broadcast('maintenance:changed', { type, id: String(id) });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listExpiries(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Bills & renewals');
});

export const create = asyncHandler(async (req, res) => {
  const item = await service.createExpiry(req.body, req.user);
  emitChange('expiry.created', item._id);
  return ApiResponse.created(res, { item }, 'Bill / renewal added');
});

export const update = asyncHandler(async (req, res) => {
  const item = await service.updateExpiry(req.params.id, req.body);
  emitChange('expiry.updated', item._id);
  return ApiResponse.ok(res, { item }, 'Bill / renewal updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteExpiry(req.params.id);
  emitChange('expiry.deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Bill / renewal deleted');
});

export const renew = asyncHandler(async (req, res) => {
  const item = await service.renewExpiry(req.params.id);
  emitChange('expiry.renewed', item._id);
  return ApiResponse.ok(res, { item }, 'Renewed — due date rolled forward');
});

/** Admin-triggered reminder sweep (also runs on a schedule). */
export const runReminders = asyncHandler(async (req, res) => {
  const result = await service.runReminderSweep();
  return ApiResponse.ok(res, result, `Checked ${result.checked} item(s), sent ${result.notified} reminder(s)`);
});
