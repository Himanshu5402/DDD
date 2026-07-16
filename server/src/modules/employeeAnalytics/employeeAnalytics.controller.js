import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './employeeAnalytics.service.js';

/** Notify connected clients that employee analytics data changed so they can refetch. */
function emitChange(type, id) {
  broadcast('employee_analytics:changed', { type, id: String(id), at: Date.now() });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listRecords(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Employee records');
});

export const create = asyncHandler(async (req, res) => {
  const record = await service.createRecord(req.body, req.user);
  emitChange('created', record._id);
  return ApiResponse.created(res, { record }, 'Employee record created');
});

export const update = asyncHandler(async (req, res) => {
  const record = await service.updateRecord(req.params.id, req.body);
  emitChange('updated', record._id);
  return ApiResponse.ok(res, { record }, 'Employee record updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteRecord(req.params.id);
  emitChange('deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Employee record deleted');
});

export const summary = asyncHandler(async (req, res) => {
  const data = await service.getSummary(req.query);
  return ApiResponse.ok(res, data, 'Employee summary');
});

export const team = asyncHandler(async (req, res) => {
  const data = await service.getTeam(req.query);
  return ApiResponse.ok(res, data, 'Team analytics');
});

export const hrmsSync = asyncHandler(async (_req, res) => {
  const data = await service.hrmsSync();
  return ApiResponse.ok(
    res,
    data,
    'HRMS integration not configured yet — this endpoint is the integration point for external HRMS APIs.'
  );
});
