import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './customFields.controller.js';
import { listQuerySchema, idParamSchema, createSchema, updateSchema } from './customFields.validation.js';

const router = Router();
const M = MODULES.CUSTOM_FIELDS;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: CustomFields, description: Admin-configurable dynamic fields }
 */

router.get('/', authorize(M, ACTIONS.READ), validate({ query: listQuerySchema }), c.list);

router.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'CustomFieldDefinition', describe: (req) => `Added field ${req.body.entityType}.${req.body.key}` }),
  c.create
);

router.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'CustomFieldDefinition', entityId: (req) => req.params.id }),
  c.update
);

router.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'CustomFieldDefinition', entityId: (req) => req.params.id }),
  c.remove
);

export default router;
