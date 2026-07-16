import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as service from './roles.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listRoles(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Roles');
});

export const catalog = asyncHandler(async (_req, res) => {
  const permissions = await service.listPermissionCatalog();
  return ApiResponse.ok(res, { permissions }, 'Permission catalog');
});

export const getOne = asyncHandler(async (req, res) => {
  const role = await service.getRole(req.params.id);
  return ApiResponse.ok(res, { role });
});

export const create = asyncHandler(async (req, res) => {
  const role = await service.createRole(req.body);
  return ApiResponse.created(res, { role }, 'Role created');
});

export const update = asyncHandler(async (req, res) => {
  const role = await service.updateRole(req.params.id, req.body);
  return ApiResponse.ok(res, { role }, 'Role updated');
});

export const setPermissions = asyncHandler(async (req, res) => {
  const role = await service.setRolePermissions(req.params.id, req.body.permissions);
  return ApiResponse.ok(res, { role }, 'Permissions updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteRole(req.params.id);
  return ApiResponse.ok(res, null, 'Role deleted');
});
