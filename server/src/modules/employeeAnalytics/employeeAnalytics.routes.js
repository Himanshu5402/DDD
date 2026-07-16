import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './employeeAnalytics.controller.js';
import {
  idParamSchema,
  listRecordsSchema,
  createRecordSchema,
  updateRecordSchema,
  summarySchema,
  teamSchema,
} from './employeeAnalytics.validation.js';

const router = Router();
const M = MODULES.EMPLOYEE_ANALYTICS;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: EmployeeAnalytics, description: Employee Analytics & HRMS (Module 7) }
 */

router.get('/records', authorize(M, ACTIONS.READ), validate({ query: listRecordsSchema }), c.list);

router.post(
  '/records',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createRecordSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'EmployeeRecord',
    describe: (req) => `Created employee record for ${req.body.user} on ${new Date(req.body.date).toDateString()}`,
  }),
  c.create
);

router.patch(
  '/records/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateRecordSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'EmployeeRecord',
    entityId: (req) => req.params.id,
  }),
  c.update
);

router.delete(
  '/records/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({
    action: ACTIONS.DELETE,
    module: M,
    entityType: 'EmployeeRecord',
    entityId: (req) => req.params.id,
  }),
  c.remove
);

router.get('/summary', authorize(M, ACTIONS.READ), validate({ query: summarySchema }), c.summary);
router.get('/team', authorize(M, ACTIONS.READ), validate({ query: teamSchema }), c.team);

router.post(
  '/hrms-sync',
  authorize(M, ACTIONS.UPDATE),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'EmployeeRecord',
    describe: () => 'Triggered HRMS sync',
  }),
  c.hrmsSync
);

export default router;
