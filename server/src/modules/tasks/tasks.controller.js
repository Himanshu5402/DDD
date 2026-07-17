import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import { notifyMany } from '../notifications/notifications.service.js';
import * as service from './tasks.service.js';

/** Notify connected clients that the board changed so they can refetch. */
function emitChange(type, taskId) {
  broadcast('tasks:changed', { type, taskId: String(taskId), at: Date.now() });
}

/** Real-time personal notification for an assignment/delegation hop. */
function notifyAssignment(recipientIds, actor, task, type) {
  const verb = type === 'task_delegated' ? 'delegated a task to you' : 'assigned you a task';
  return notifyMany(recipientIds, {
    actor: actor._id,
    type,
    message: `${actor.name} ${verb}: "${task.title}"`,
    entityType: 'task',
    entityId: task._id,
    link: `/tasks?task=${task._id}`,
  });
}

export const list = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listTasks(req.query, req.user);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Tasks');
});

export const board = asyncHandler(async (req, res) => {
  const data = await service.getBoard(req.query, req.user);
  return ApiResponse.ok(res, data, 'Board');
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await service.getTask(req.params.id);
  return ApiResponse.ok(res, data, 'Task');
});

export const create = asyncHandler(async (req, res) => {
  const task = await service.createTask(req.body, req.user);
  emitChange('created', task._id);
  const assigneeIds = (task.assignees || []).map((a) => a._id || a);
  if (assigneeIds.length) notifyAssignment(assigneeIds, req.user, task, 'task_assigned');
  return ApiResponse.created(res, { task }, 'Task created');
});

export const update = asyncHandler(async (req, res) => {
  const { task, addedAssignees } = await service.updateTask(req.params.id, req.body, req.user);
  emitChange('updated', task._id);
  if (addedAssignees.length) notifyAssignment(addedAssignees, req.user, task, 'task_assigned');
  return ApiResponse.ok(res, { task }, 'Task updated');
});

export const delegate = asyncHandler(async (req, res) => {
  const { task, targets } = await service.delegateTask(req.params.id, req.body, {
    user: req.user,
    permissions: req.permissions,
    isSuperAdmin: req.isSuperAdmin,
  });
  emitChange('updated', task._id);
  notifyAssignment(targets.map((t) => t._id), req.user, task, 'task_delegated');
  return ApiResponse.ok(res, { task }, 'Task delegated');
});

export const move = asyncHandler(async (req, res) => {
  const { task, spawned, completedNow } = await service.moveTask(req.params.id, req.body, req.user);
  emitChange('moved', task._id);
  if (spawned) emitChange('created', spawned._id);

  // Close the loop: whoever assigned/delegated/created the task hears it's done.
  if (completedNow) {
    const recipients = new Set();
    if (task.assignedBy) recipients.add(String(task.assignedBy._id || task.assignedBy));
    if (task.createdBy) recipients.add(String(task.createdBy._id || task.createdBy));
    for (const hop of task.delegationChain || []) {
      if (hop.from) recipients.add(String(hop.from));
    }
    notifyMany([...recipients], {
      actor: req.user._id,
      type: 'task_completed',
      message: `${req.user.name} completed the task: "${task.title}"`,
      entityType: 'task',
      entityId: task._id,
      link: `/tasks?task=${task._id}`,
    });
  }
  return ApiResponse.ok(res, { task, spawned }, 'Task moved');
});

export const remove = asyncHandler(async (req, res) => {
  await service.deleteTask(req.params.id);
  emitChange('deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Task deleted');
});

export const addComment = asyncHandler(async (req, res) => {
  const comment = await service.addComment(req.params.id, req.user._id, req.body.body);
  emitChange('commented', req.params.id);
  return ApiResponse.created(res, { comment }, 'Comment added');
});

export const addChecklistItem = asyncHandler(async (req, res) => {
  const checklist = await service.addChecklistItem(req.params.id, req.body.text);
  emitChange('updated', req.params.id);
  return ApiResponse.ok(res, { checklist }, 'Checklist item added');
});

export const toggleChecklistItem = asyncHandler(async (req, res) => {
  const checklist = await service.toggleChecklistItem(req.params.id, req.params.itemId, req.user._id);
  emitChange('updated', req.params.id);
  return ApiResponse.ok(res, { checklist }, 'Checklist updated');
});

export const logTime = asyncHandler(async (req, res) => {
  const result = await service.logTime(req.params.id, req.user._id, req.body.minutes, req.body.note);
  emitChange('updated', req.params.id);
  return ApiResponse.ok(res, result, 'Time logged');
});

export const aiSummary = asyncHandler(async (req, res) => {
  const result = await service.aiSummary(req.params.id);
  return ApiResponse.ok(res, result, 'AI summary');
});
