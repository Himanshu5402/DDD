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
  assignRolesSchema,
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

router.patch(
  '/:id/roles',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: assignRolesSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'User', entityId: (req) => req.params.id, describe: () => 'Reassigned roles' }),
  c.assignRoles
);

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
