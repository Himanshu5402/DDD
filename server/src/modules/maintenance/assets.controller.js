import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './assets.service.js';

/** Notify connected clients that maintenance data changed so they can refetch. */
function emitChange(type, id) {
  broadcast('maintenance:changed', { type, id: String(id) });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listAssets(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Assets');
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await service.getAsset(req.params.id);
  return ApiResponse.ok(res, data, 'Asset');
});

export const create = asyncHandler(async (req, res) => {
  const asset = await service.createAsset(req.body, req.user);
  emitChange('asset.created', asset._id);
  return ApiResponse.created(res, { asset }, 'Asset created');
});

export const update = asyncHandler(async (req, res) => {
  const asset = await service.updateAsset(req.params.id, req.body);
  emitChange('asset.updated', asset._id);
  return ApiResponse.ok(res, { asset }, 'Asset updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteAsset(req.params.id);
  emitChange('asset.deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Asset deleted');
});
