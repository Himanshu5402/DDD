import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './records.service.js';

/** Notify connected clients that maintenance data changed so they can refetch. */
function emitChange(type, id) {
  broadcast('maintenance:changed', { type, id: String(id) });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listRecords(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Maintenance records');
});

export const create = asyncHandler(async (req, res) => {
  const record = await service.createRecord(req.body, req.user);
  emitChange('record.created', record._id);
  return ApiResponse.created(res, { record }, 'Maintenance record created');
});

export const update = asyncHandler(async (req, res) => {
  const record = await service.updateRecord(req.params.id, req.body);
  emitChange('record.updated', record._id);
  return ApiResponse.ok(res, { record }, 'Maintenance record updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteRecord(req.params.id);
  emitChange('record.deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Maintenance record deleted');
});

export const upcoming = asyncHandler(async (req, res) => {
  const data = await service.getUpcoming(req.query);
  return ApiResponse.ok(res, data, 'Upcoming maintenance');
});

/** Admin-triggered maintenance reminder sweep (also runs on a schedule). */
export const runReminders = asyncHandler(async (req, res) => {
  const result = await service.runMaintenanceReminderSweep();
  return ApiResponse.ok(res, result, `Checked ${result.checked} job(s), sent ${result.notified} reminder(s)`);
});
