import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as service from './users.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listUsers(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Users');
});

export const getOne = asyncHandler(async (req, res) => {
  const user = await service.getUser(req.params.id);
  return ApiResponse.ok(res, { user });
});

export const create = asyncHandler(async (req, res) => {
  const user = await service.createUser(req.body);
  return ApiResponse.created(res, { user }, 'User created');
});

export const update = asyncHandler(async (req, res) => {
  const user = await service.updateUser(req.params.id, req.body);
  return ApiResponse.ok(res, { user }, 'User updated');
});

export const setStatus = asyncHandler(async (req, res) => {
  const user = await service.setUserStatus(req.params.id, req.body.isActive, req.user._id);
  return ApiResponse.ok(res, { user }, 'User status updated');
});

export const assignRoles = asyncHandler(async (req, res) => {
  const user = await service.assignRoles(req.params.id, req.body.roles);
  return ApiResponse.ok(res, { user }, 'Roles assigned');
});

export const resetPassword = asyncHandler(async (req, res) => {
  await service.adminResetPassword(req.params.id, req.body.newPassword);
  return ApiResponse.ok(res, null, 'Password reset');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteUser(req.params.id, req.user._id);
  return ApiResponse.ok(res, null, 'User deleted');
});
