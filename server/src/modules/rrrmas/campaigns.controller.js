import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './campaigns.service.js';

/** Notify connected clients that an RRRMAS record changed so they can refetch. */
function emitChange(type, id) {
  broadcast('rrrmas:changed', { type, id: String(id) });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listCampaigns(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Campaigns');
});

export const getOne = asyncHandler(async (req, res) => {
  const campaign = await service.getCampaign(req.params.id);
  return ApiResponse.ok(res, { campaign }, 'Campaign');
});

export const create = asyncHandler(async (req, res) => {
  const campaign = await service.createCampaign(req.body, req.user);
  emitChange('campaign.created', campaign._id);
  return ApiResponse.created(res, { campaign }, 'Campaign created');
});

export const update = asyncHandler(async (req, res) => {
  const campaign = await service.updateCampaign(req.params.id, req.body);
  emitChange('campaign.updated', campaign._id);
  return ApiResponse.ok(res, { campaign }, 'Campaign updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteCampaign(req.params.id);
  emitChange('campaign.deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Campaign deleted');
});
