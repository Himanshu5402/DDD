import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import { requireApiKeyFor } from '../../middleware/apiKey.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './erp.controller.js';

const router = Router();
const M = MODULES.ERP;

// Dedicated key so a leaked ERP key never opens the HRMS/PEPSI inboxes.
const requireErpApiKey = requireApiKeyFor('ERP_INTEGRATION_API_KEY');

// {event, payload, occurredAt} — payload is the full ERP doc, passed through
// to the per-event upsert (forward-compatible: unknown events are ignored).
const eventSchema = z.object({
  event: z.string().min(1),
  payload: z.any().optional(),
  occurredAt: z.string().optional(),
});

/** /status serves both the ERP (x-api-key) and the owner console (JWT). */
function apiKeyOrAuthenticate(req, res, next) {
  if (req.headers['x-api-key']) return requireErpApiKey(req, res, next);
  return authenticate(req, res, next);
}

/**
 * @swagger
 * /integrations/erp/events:
 *   post:
 *     tags: [Integrations]
 *     summary: Inbound ERP event push (x-api-key) — idempotent mirror upsert
 *     responses:
 *       200: { description: Event processed (or ignored if unknown) }
 */
// NB machine-to-machine — API key only, deliberately NO authenticate/JWT.
router.post('/events', requireErpApiKey, validate({ body: eventSchema }), c.events);

/**
 * @swagger
 * /integrations/erp/status:
 *   get:
 *     tags: [Integrations]
 *     summary: ERP integration status (enabled, reachability, mirror counts)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/status', apiKeyOrAuthenticate, c.status);

/**
 * @swagger
 * /integrations/erp/sync:
 *   post:
 *     tags: [Integrations]
 *     summary: Full bootstrap pull from the ERP (owner button)
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
    entityType: 'ErpSync',
    describe: () => 'ERP bootstrap sync (full mirror pull)',
  }),
  c.sync
);

export default router;
