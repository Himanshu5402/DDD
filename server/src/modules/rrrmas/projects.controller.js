import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './projects.service.js';

/** Notify connected clients that an RRRMAS record changed so they can refetch. */
function emitChange(type, id) {
  broadcast('rrrmas:changed', { type, id: String(id) });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listProjects(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Projects');
});

export const getOne = asyncHandler(async (req, res) => {
  const project = await service.getProject(req.params.id);
  return ApiResponse.ok(res, { project }, 'Project');
});

export const create = asyncHandler(async (req, res) => {
  const project = await service.createProject(req.body, req.user);
  emitChange('project.created', project._id);
  return ApiResponse.created(res, { project }, 'Project created');
});

export const update = asyncHandler(async (req, res) => {
  const project = await service.updateProject(req.params.id, req.body);
  emitChange('project.updated', project._id);
  return ApiResponse.ok(res, { project }, 'Project updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteProject(req.params.id);
  emitChange('project.deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Project deleted');
});
