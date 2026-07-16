import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './roles.controller.js';
import {
  idParamSchema,
  listRolesSchema,
  createRoleSchema,
  updateRoleSchema,
  setPermissionsSchema,
} from './roles.validation.js';

const router = Router();
const M = MODULES.ROLES;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Roles, description: Roles & permissions (RBAC) }
 */

// Permission catalog for building the role editor (read permission on roles).
router.get('/permissions/catalog', authorize(M, ACTIONS.READ), c.catalog);

router.get('/', authorize(M, ACTIONS.READ), validate({ query: listRolesSchema }), c.list);

router.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createRoleSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'Role', describe: (req) => `Created role ${req.body.name}` }),
  c.create
);

router.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.getOne);

router.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateRoleSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Role', entityId: (req) => req.params.id }),
  c.update
);

router.put(
  '/:id/permissions',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: setPermissionsSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Role', entityId: (req) => req.params.id, describe: () => 'Updated permissions' }),
  c.setPermissions
);

router.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Role', entityId: (req) => req.params.id }),
  c.remove
);

export default router;
