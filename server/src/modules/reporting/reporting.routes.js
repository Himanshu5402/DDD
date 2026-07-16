import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './reporting.controller.js';
import {
  idParamSchema,
  submitReportSchema,
  listMineSchema,
  teamQuerySchema,
  digestSchema,
} from './reporting.validation.js';

const router = Router();
const M = MODULES.EVENING_REPORTING;
// Team-wide views additionally require employee analytics read (managers/admins).
const ANALYTICS = MODULES.EMPLOYEE_ANALYTICS;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Reporting, description: Evening Reporting (Module 8) }
 */

router.post(
  '/submit',
  authorize(M, ACTIONS.CREATE),
  validate({ body: submitReportSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'DailyReport', describe: () => 'Submitted daily report' }),
  c.submit
);

router.get('/mine', authorize(M, ACTIONS.READ), validate({ query: listMineSchema }), c.mine);

router.get(
  '/team',
  authorize(M, ACTIONS.READ),
  authorize(ANALYTICS, ACTIONS.READ),
  validate({ query: teamQuerySchema }),
  c.team
);

router.post(
  '/digest',
  authorize(M, ACTIONS.READ),
  authorize(ANALYTICS, ACTIONS.READ),
  validate({ body: digestSchema }),
  c.digest
);

router.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.getOne);

router.patch(
  '/:id/review',
  authorize(M, ACTIONS.UPDATE),
  authorize(ANALYTICS, ACTIONS.READ),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'DailyReport', entityId: (req) => req.params.id, describe: () => 'Reviewed daily report' }),
  c.review
);

router.post('/:id/ai-summary', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.aiSummary);

export default router;
