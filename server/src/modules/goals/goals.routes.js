import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './goals.controller.js';
import {
  idParamSchema,
  itemParamSchema,
  listGoalsSchema,
  createGoalSchema,
  updateGoalSchema,
  progressSchema,
  milestoneSchema,
  checklistItemSchema,
} from './goals.validation.js';

const router = Router();
const M = MODULES.GOALS;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Goals, description: Goal Management (Module 1) }
 */

router.get('/', authorize(M, ACTIONS.READ), validate({ query: listGoalsSchema }), c.list);

router.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createGoalSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'Goal', describe: (req) => `Created goal "${req.body.title}"` }),
  c.create
);

router.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.getOne);

router.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateGoalSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Goal', entityId: (req) => req.params.id }),
  c.update
);

router.patch(
  '/:id/progress',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: progressSchema }),
  c.updateProgress
);

router.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Goal', entityId: (req) => req.params.id }),
  c.remove
);

router.post('/:id/milestones', authorize(M, ACTIONS.UPDATE), validate({ params: idParamSchema, body: milestoneSchema }), c.addMilestone);
router.patch('/:id/milestones/:itemId', authorize(M, ACTIONS.UPDATE), validate({ params: itemParamSchema }), c.toggleMilestone);
router.post('/:id/checklist', authorize(M, ACTIONS.UPDATE), validate({ params: idParamSchema, body: checklistItemSchema }), c.addChecklistItem);
router.patch('/:id/checklist/:itemId', authorize(M, ACTIONS.UPDATE), validate({ params: itemParamSchema }), c.toggleChecklistItem);
router.post('/:id/ai-suggestions', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.aiSuggestions);

export default router;
