import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './budgets.service.js';

/** Notify connected clients that finance data changed so they can refetch. */
function emitChange(type, id) {
  broadcast('finance:changed', { type, id: String(id), at: Date.now() });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listBudgets(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Budgets');
});

export const create = asyncHandler(async (req, res) => {
  const budget = await service.createBudget(req.body, req.user);
  emitChange('budget:created', budget._id);
  return ApiResponse.created(res, { budget }, 'Budget created');
});

export const update = asyncHandler(async (req, res) => {
  const budget = await service.updateBudget(req.params.id, req.body);
  emitChange('budget:updated', budget._id);
  return ApiResponse.ok(res, { budget }, 'Budget updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteBudget(req.params.id);
  emitChange('budget:deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Budget deleted');
});
