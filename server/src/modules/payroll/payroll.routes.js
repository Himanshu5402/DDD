import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './payroll.controller.js';
import {
  idParamSchema,
  listPeriodsSchema,
  createPeriodSchema,
  updatePeriodSchema,
  runHrmsPayrollSchema,
} from './payroll.validation.js';

const router = Router();
const M = MODULES.PAYROLL;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Payroll, description: Monthly payroll cost roll-ups (owner view — aggregates only) }
 */

router.get(
  '/periods',
  authorize(M, ACTIONS.READ),
  validate({ query: listPeriodsSchema }),
  c.list
);

router.post(
  '/periods',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createPeriodSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'PayrollPeriod',
    describe: (req) => `Created payroll period for ${req.body.month}`,
  }),
  c.create
);

router.get('/summary', authorize(M, ACTIONS.READ), c.summary);

// Write-through: run payroll for a month in the HRMS (mirror refreshes via echo).
router.post(
  '/hrms/run',
  authorize(M, ACTIONS.CREATE),
  validate({ body: runHrmsPayrollSchema }),
  auditAction({
    action: ACTIONS.CREATE,
    module: M,
    entityType: 'PayrollPeriod',
    describe: (req) => `Ran HRMS payroll for ${req.body.month}`,
  }),
  c.runHrms
);

router.patch(
  '/periods/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updatePeriodSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'PayrollPeriod', entityId: (req) => req.params.id }),
  c.update
);

router.delete(
  '/periods/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'PayrollPeriod', entityId: (req) => req.params.id }),
  c.remove
);

export default router;
