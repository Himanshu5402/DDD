import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import ApiError from '../../utils/ApiError.js';
import Task from '../../models/task.model.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './tasks.controller.js';
import {
  idParamSchema,
  itemParamSchema,
  listTasksSchema,
  boardSchema,
  createTaskSchema,
  updateTaskSchema,
  moveSchema,
  delegateSchema,
  commentSchema,
  checklistItemSchema,
  logTimeSchema,
} from './tasks.validation.js';

const router = Router();
const M = MODULES.TASKS;

router.use(authenticate);

/**
 * Jira-style participant guard: users with tasks:update/manage pass outright;
 * otherwise a user holding tasks:read may still WORK their own items — move,
 * comment, checklist, log time — when they are an assignee, watcher, or the
 * creator of THIS task. Full edits/deletes stay behind tasks:update/delete.
 */
async function participantGuard(req, _res, next) {
  try {
    if (req.isSuperAdmin) return next();
    const perms = req.permissions || new Set();
    if (perms.has(`${M}:${ACTIONS.UPDATE}`) || perms.has(`${M}:${ACTIONS.MANAGE}`)) return next();
    if (!perms.has(`${M}:${ACTIONS.READ}`)) {
      return next(
        ApiError.forbidden(`Missing permission: ${M}:${ACTIONS.READ}`, { code: 'INSUFFICIENT_PERMISSIONS' })
      );
    }

    const task = await Task.findById(req.params.id).select('assignees watchers createdBy');
    if (!task) return next(ApiError.notFound('Task not found'));

    const uid = String(req.user._id);
    const isParticipant =
      (task.assignees || []).some((a) => String(a) === uid) ||
      (task.watchers || []).some((w) => String(w) === uid) ||
      String(task.createdBy) === uid;

    if (isParticipant) return next();
    return next(
      ApiError.forbidden('You can only update tasks you are assigned to', { code: 'NOT_TASK_PARTICIPANT' })
    );
  } catch (err) {
    next(err);
  }
}

/**
 * @swagger
 * tags: { name: Tasks, description: Daily Task Management (Module 2) }
 */

router.get('/board', authorize(M, ACTIONS.READ), validate({ query: boardSchema }), c.board);
router.get('/', authorize(M, ACTIONS.READ), validate({ query: listTasksSchema }), c.list);

router.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createTaskSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'Task', describe: (req) => `Created task "${req.body.title}"` }),
  c.create
);

router.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.getOne);

router.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateTaskSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Task', entityId: (req) => req.params.id }),
  c.update
);

router.patch(
  '/:id/move',
  participantGuard,
  validate({ params: idParamSchema, body: moveSchema }),
  c.move
);

// Delegate down the org chart. participantGuard admits privileged users and
// task participants; the service then enforces that non-privileged actors are
// current assignees delegating only to their own direct reports.
router.post(
  '/:id/delegate',
  participantGuard,
  validate({ params: idParamSchema, body: delegateSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'Task',
    entityId: (req) => req.params.id,
    describe: (req) => `Delegated task to ${req.body.assignees.length} user(s)`,
  }),
  c.delegate
);

router.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Task', entityId: (req) => req.params.id }),
  c.remove
);

router.post('/:id/comments', participantGuard, validate({ params: idParamSchema, body: commentSchema }), c.addComment);
router.post('/:id/checklist', participantGuard, validate({ params: idParamSchema, body: checklistItemSchema }), c.addChecklistItem);
router.patch('/:id/checklist/:itemId', participantGuard, validate({ params: itemParamSchema }), c.toggleChecklistItem);
router.post('/:id/time', participantGuard, validate({ params: idParamSchema, body: logTimeSchema }), c.logTime);
router.post('/:id/ai-summary', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.aiSummary);

export default router;
