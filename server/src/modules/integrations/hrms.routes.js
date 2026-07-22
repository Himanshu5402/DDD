import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import requireApiKey from '../../middleware/apiKey.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './hrms.controller.js';

const router = Router();
const M = MODULES.EMPLOYEE_ANALYTICS; // HRMS mirror data lives under HR analytics

// {event, payload, occurredAt} — payload is the full HRMS doc, passed through
// to the per-event upsert (forward-compatible: unknown events are ignored).
const eventSchema = z.object({
  event: z.string().min(1),
  payload: z.any().optional(),
  occurredAt: z.string().optional(),
});

/** /status serves both the HRMS (x-api-key) and the owner console (JWT). */
function apiKeyOrAuthenticate(req, res, next) {
  if (req.headers['x-api-key']) return requireApiKey(req, res, next);
  return authenticate(req, res, next);
}

/**
 * @swagger
 * tags: { name: Integrations, description: External system sync (HRMS) }
 */

/**
 * @swagger
 * /integrations/hrms/events:
 *   post:
 *     tags: [Integrations]
 *     summary: Inbound HRMS event push (x-api-key) — idempotent mirror upsert
 *     responses:
 *       200: { description: Event processed (or ignored if unknown) }
 */
// NB machine-to-machine — API key only, deliberately NO authenticate/JWT.
router.post('/events', requireApiKey, validate({ body: eventSchema }), c.events);

/**
 * @swagger
 * /integrations/hrms/status:
 *   get:
 *     tags: [Integrations]
 *     summary: HRMS integration status (enabled, reachability, mirror counts)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/status', apiKeyOrAuthenticate, c.status);

/**
 * @swagger
 * /integrations/hrms/sync:
 *   post:
 *     tags: [Integrations]
 *     summary: Full bootstrap pull from the HRMS (owner button)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Sync result with per-model counts }
 */
router.post(
  '/sync',
  authenticate,
  authorize(M, ACTIONS.UPDATE),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'HrmsSync',
    describe: () => 'HRMS bootstrap sync (full mirror pull)',
  }),
  c.sync
);

export default router;
