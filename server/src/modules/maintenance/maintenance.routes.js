import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as assetsC from './assets.controller.js';
import * as recordsC from './records.controller.js';
import {
  idParamSchema,
  listAssetsSchema,
  createAssetSchema,
  updateAssetSchema,
  listRecordsSchema,
  createRecordSchema,
  updateRecordSchema,
  upcomingSchema,
} from './maintenance.validation.js';

const M = MODULES.MAINTENANCE;

// --- Assets sub-router --------------------------------------------------------

const assetsRouter = Router();

assetsRouter.get('/', authorize(M, ACTIONS.READ), validate({ query: listAssetsSchema }), assetsC.list);

assetsRouter.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createAssetSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'Asset', describe: (req) => `Created asset "${req.body.name}"` }),
  assetsC.create
);

assetsRouter.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), assetsC.getOne);

assetsRouter.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateAssetSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Asset', entityId: (req) => req.params.id }),
  assetsC.update
);

assetsRouter.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Asset', entityId: (req) => req.params.id }),
  assetsC.remove
);

// --- Maintenance records sub-router --------------------------------------------

const recordsRouter = Router();

recordsRouter.get('/', authorize(M, ACTIONS.READ), validate({ query: listRecordsSchema }), recordsC.list);

recordsRouter.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createRecordSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'MaintenanceRecord', describe: (req) => `Scheduled ${req.body.type} maintenance` }),
  recordsC.create
);

recordsRouter.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateRecordSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'MaintenanceRecord', entityId: (req) => req.params.id }),
  recordsC.update
);

recordsRouter.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'MaintenanceRecord', entityId: (req) => req.params.id }),
  recordsC.remove
);

// --- Module router --------------------------------------------------------------

const router = Router();

// All maintenance routes require authentication.
router.use(authenticate);

/**
 * @swagger
 * tags: { name: Maintenance, description: Maintenance & Asset Management (Module 6) }
 */

router.get('/upcoming', authorize(M, ACTIONS.READ), validate({ query: upcomingSchema }), recordsC.upcoming);

router.use('/assets', assetsRouter);
router.use('/records', recordsRouter);

export default router;
