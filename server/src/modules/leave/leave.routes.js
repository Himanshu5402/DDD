import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './leave.controller.js';
import {
  idParamSchema,
  listRequestsSchema,
  listBalancesSchema,
  summaryQuerySchema,
  createRequestSchema,
  updateRequestSchema,
  decideRequestSchema,
} from './leave.validation.js';

const router = Router();
const M = MODULES.LEAVE;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Leave, description: Leave requests & balances (HRMS-mirrored) }
 */

router.get(
  '/requests',
  authorize(M, ACTIONS.READ),
  validate({ query: listRequestsSchema }),
  c.listRequests
);

router.post(
  '/requests',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createRequestSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'LeaveRequest', describe: () => 'Created leave request' }),
  c.createRequest
);

router.get(
  '/balances',
  authorize(M, ACTIONS.READ),
  validate({ query: listBalancesSchema }),
  c.listBalances
);

router.get(
  '/summary',
  authorize(M, ACTIONS.READ),
  validate({ query: summaryQuerySchema }),
  c.summary
);

router.post(
  '/requests/:id/decide',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: decideRequestSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'LeaveRequest',
    entityId: (req) => req.params.id,
    describe: (req) => `Leave request ${req.body.decision}`,
  }),
  c.decideRequest
);

router.patch(
  '/requests/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateRequestSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'LeaveRequest', entityId: (req) => req.params.id }),
  c.updateRequest
);

router.delete(
  '/requests/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'LeaveRequest', entityId: (req) => req.params.id }),
  c.removeRequest
);

export default router;
