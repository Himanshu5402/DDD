import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as service from './customFields.service.js';

export const list = asyncHandler(async (req, res) => {
  const defs = await service.listDefinitions(req.query.entityType, {
    includeInactive: req.query.includeInactive,
  });
  return ApiResponse.ok(res, { definitions: defs }, 'Custom fields');
});

export const create = asyncHandler(async (req, res) => {
  const def = await service.createDefinition(req.body, req.user._id);
  return ApiResponse.created(res, { definition: def }, 'Custom field created');
});

export const update = asyncHandler(async (req, res) => {
  const def = await service.updateDefinition(req.params.id, req.body);
  return ApiResponse.ok(res, { definition: def }, 'Custom field updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteDefinition(req.params.id);
  return ApiResponse.ok(res, null, 'Custom field deleted');
});
