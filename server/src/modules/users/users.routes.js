import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './users.controller.js';
import {
  listUsersSchema,
  idParamSchema,
  createUserSchema,
  updateUserSchema,
  setStatusSchema,
  resetPasswordSchema,
} from './users.validation.js';

const router = Router();
const M = MODULES.USERS;

// All user routes require authentication.
router.use(authenticate);

/**
 * @swagger
 * tags: { name: Users, description: User management }
 */

router.get('/', authorize(M, ACTIONS.READ), validate({ query: listUsersSchema }), c.list);

// Personal/directory routes — authenticate-only (no users:read needed), and
// registered before /:id so the literal paths aren't captured as ids.
router.get('/my-team', c.myTeam);
router.get('/org-chart', c.orgChart);

router.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createUserSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'User', describe: (req) => `Created user ${req.body.email}` }),
  c.create
);

router.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.getOne);

router.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateUserSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'User', entityId: (req) => req.params.id }),
  c.update
);

router.patch(
  '/:id/status',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: setStatusSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'User', entityId: (req) => req.params.id }),
  c.setStatus
);

// PATCH /:id/roles removed — RBAC gone (owner-only console).

router.post(
  '/:id/reset-password',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'User', entityId: (req) => req.params.id, describe: () => 'Reset password' }),
  c.resetPassword
);

router.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'User', entityId: (req) => req.params.id }),
  c.remove
);

export default router;
