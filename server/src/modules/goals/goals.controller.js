import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './goals.service.js';

/** Notify connected clients that goals changed so they can refetch. */
function emitChange(type, id) {
  broadcast('goals:changed', { type, id: String(id), at: Date.now() });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listGoals(req.query, req.user);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Goals');
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await service.getGoal(req.params.id);
  return ApiResponse.ok(res, data, 'Goal');
});

export const create = asyncHandler(async (req, res) => {
  const goal = await service.createGoal(req.body, req.user);
  emitChange('created', goal._id);
  return ApiResponse.created(res, { goal }, 'Goal created');
});

export const update = asyncHandler(async (req, res) => {
  const goal = await service.updateGoal(req.params.id, req.body, req.user);
  emitChange('updated', goal._id);
  return ApiResponse.ok(res, { goal }, 'Goal updated');
});

export const updateProgress = asyncHandler(async (req, res) => {
  const goal = await service.updateProgress(req.params.id, req.body);
  emitChange('updated', goal._id);
  return ApiResponse.ok(res, { goal }, 'Progress updated');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteGoal(req.params.id);
  emitChange('deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Goal deleted');
});

export const addMilestone = asyncHandler(async (req, res) => {
  const milestones = await service.addMilestone(req.params.id, req.body);
  emitChange('updated', req.params.id);
  return ApiResponse.ok(res, { milestones }, 'Milestone added');
});

export const toggleMilestone = asyncHandler(async (req, res) => {
  const milestones = await service.toggleMilestone(req.params.id, req.params.itemId);
  emitChange('updated', req.params.id);
  return ApiResponse.ok(res, { milestones }, 'Milestone updated');
});

export const addChecklistItem = asyncHandler(async (req, res) => {
  const checklist = await service.addChecklistItem(req.params.id, req.body.text);
  emitChange('updated', req.params.id);
  return ApiResponse.ok(res, { checklist }, 'Checklist item added');
});

export const toggleChecklistItem = asyncHandler(async (req, res) => {
  const checklist = await service.toggleChecklistItem(req.params.id, req.params.itemId);
  emitChange('updated', req.params.id);
  return ApiResponse.ok(res, { checklist }, 'Checklist updated');
});

export const aiSuggestions = asyncHandler(async (req, res) => {
  const result = await service.aiSuggestions(req.params.id);
  return ApiResponse.ok(res, result, 'AI suggestions');
});
