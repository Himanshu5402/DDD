import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { uploadReportMedia, handleUpload } from '../../middleware/upload.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './reporting.controller.js';
import {
  idParamSchema,
  submitReportSchema,
  listMineSchema,
  teamQuerySchema,
  digestSchema,
  rejectSchema,
} from './reporting.validation.js';

const router = Router();
const M = MODULES.EVENING_REPORTING;

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

// Upload photos/videos for a report (stored via the storage provider).
router.post(
  '/upload',
  authorize(M, ACTIONS.CREATE),
  handleUpload(uploadReportMedia),
  c.upload
);

// Team/review views + digest are scoped to the caller's org position in the
// service (admin → all, manager → direct reports). No extra module permission
// needed — the org relationship is the authorization.
router.get('/team', authorize(M, ACTIONS.READ), validate({ query: teamQuerySchema }), c.team);

router.post('/digest', authorize(M, ACTIONS.READ), validate({ body: digestSchema }), c.digest);

router.get('/:id', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.getOne);

// Approve / reject — the service enforces the manager→admin review chain.
router.patch(
  '/:id/approve',
  authorize(M, ACTIONS.READ),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'DailyReport', entityId: (req) => req.params.id, describe: () => 'Approved daily report' }),
  c.approve
);

router.patch(
  '/:id/reject',
  authorize(M, ACTIONS.READ),
  validate({ params: idParamSchema, body: rejectSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'DailyReport', entityId: (req) => req.params.id, describe: () => 'Returned daily report' }),
  c.reject
);

router.post('/:id/ai-summary', authorize(M, ACTIONS.READ), validate({ params: idParamSchema }), c.aiSummary);

export default router;
