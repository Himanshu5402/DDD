import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './renewals.service.js';

/** Notify connected clients that an RRRMAS record changed so they can refetch. */
function emitChange(type, id) {
  broadcast('rrrmas:changed', { type, id: String(id) });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listRenewals(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Renewals');
});

export const getOne = asyncHandler(async (req, res) => {
  const renewal = await service.getRenewal(req.params.id);
  return ApiResponse.ok(res, { renewal }, 'Renewal');
});

export const create = asyncHandler(async (req, res) => {
  const renewal = await service.createRenewal(req.body, req.user);
  emitChange('renewal.created', renewal._id);
  return ApiResponse.created(res, { renewal }, 'Renewal created');
});

export const update = asyncHandler(async (req, res) => {
  const renewal = await service.updateRenewal(req.params.id, req.body);
  emitChange('renewal.updated', renewal._id);
  return ApiResponse.ok(res, { renewal }, 'Renewal updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteRenewal(req.params.id);
  emitChange('renewal.deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Renewal deleted');
});
