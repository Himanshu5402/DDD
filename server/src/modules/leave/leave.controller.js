import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './leave.service.js';

/** Notify connected clients that leave data changed so they can refetch. */
function emitChange(type, id) {
  broadcast('leave:changed', { type, id: String(id), at: Date.now() });
}

export const listRequests = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listRequests(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Leave requests');
});

export const createRequest = asyncHandler(async (req, res) => {
  const request = await service.createRequest(req.body, req.user);
  emitChange('created', request._id);
  return ApiResponse.created(res, { request }, 'Leave request created');
});

export const updateRequest = asyncHandler(async (req, res) => {
  const request = await service.updateRequest(req.params.id, req.body);
  emitChange('updated', request._id);
  return ApiResponse.ok(res, { request }, 'Leave request updated');
});

export const decideRequest = asyncHandler(async (req, res) => {
  const request = await service.decideRequest(req.params.id, req.body.decision, req.user);
  emitChange('updated', request._id);
  return ApiResponse.ok(res, { request }, `Leave request ${req.body.decision}`);
});

export const removeRequest = asyncHandler(async (req, res) => {
  await service.deleteRequest(req.params.id);
  emitChange('deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Leave request deleted');
});

export const listBalances = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listBalances(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Leave balances');
});

export const summary = asyncHandler(async (req, res) => {
  const data = await service.getSummary(req.query);
  return ApiResponse.ok(res, data, 'Leave summary');
});
