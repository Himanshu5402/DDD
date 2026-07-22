import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './payroll.service.js';

/** Notify connected clients that payroll data changed so they can refetch. */
function emitChange(type, periodId) {
  broadcast('payroll:changed', { type, id: String(periodId), at: Date.now() });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listPeriods(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Payroll periods');
});

export const create = asyncHandler(async (req, res) => {
  const period = await service.createPeriod(req.body, req.user);
  emitChange('created', period._id);
  return ApiResponse.created(res, { period }, 'Payroll period created');
});

export const update = asyncHandler(async (req, res) => {
  const period = await service.updatePeriod(req.params.id, req.body);
  emitChange('updated', period._id);
  return ApiResponse.ok(res, { period }, 'Payroll period updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deletePeriod(req.params.id);
  emitChange('deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Payroll period deleted');
});

export const summary = asyncHandler(async (req, res) => {
  const data = await service.getSummary();
  return ApiResponse.ok(res, data, 'Payroll summary');
});

export const runHrms = asyncHandler(async (req, res) => {
  const data = await service.runPayrollInHrms(req.body.month);
  emitChange('hrms_run', data.period?._id ?? req.body.month);
  return ApiResponse.ok(res, data, `Payroll run in HRMS for ${req.body.month}`);
});
