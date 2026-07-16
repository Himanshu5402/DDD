import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as service from './dashboard.service.js';

export const getOverview = asyncHandler(async (req, res) => {
  const data = await service.getOverview(req.user, req.permissions, req.isSuperAdmin);
  return ApiResponse.ok(res, data, 'Dashboard overview');
});
