import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as assetsC from './assets.controller.js';
import * as recordsC from './records.controller.js';
import * as expiriesC from './expiries.controller.js';
import {
  idParamSchema,
  listAssetsSchema,
  createAssetSchema,
  updateAssetSchema,
  listRecordsSchema,
  createRecordSchema,
  updateRecordSchema,
  listExpiriesSchema,
  createExpirySchema,
  updateExpirySchema,
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

// Manually fire the maintenance reminder sweep (also runs on a schedule).
recordsRouter.post('/run-reminders', authorize(M, ACTIONS.UPDATE), recordsC.runReminders);

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

// --- Bills & renewals (expiry items) sub-router --------------------------------

const expiriesRouter = Router();

expiriesRouter.get('/', authorize(M, ACTIONS.READ), validate({ query: listExpiriesSchema }), expiriesC.list);

expiriesRouter.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createExpirySchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'ExpiryItem', describe: (req) => `Added bill/renewal "${req.body.name}"` }),
  expiriesC.create
);

// Manually fire the reminder sweep (also runs on a schedule).
expiriesRouter.post('/run-reminders', authorize(M, ACTIONS.UPDATE), expiriesC.runReminders);

expiriesRouter.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateExpirySchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ExpiryItem', entityId: (req) => req.params.id }),
  expiriesC.update
);

// Renew: roll the due date forward one period (or mark a one-off paid).
expiriesRouter.post(
  '/:id/renew',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'ExpiryItem', entityId: (req) => req.params.id, describe: () => 'Renewed bill/renewal' }),
  expiriesC.renew
);

expiriesRouter.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'ExpiryItem', entityId: (req) => req.params.id }),
  expiriesC.remove
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
router.use('/expiries', expiriesRouter);

export default router;
