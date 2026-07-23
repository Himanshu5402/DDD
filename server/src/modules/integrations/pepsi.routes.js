import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import { requireApiKeyFor } from '../../middleware/apiKey.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import { upsertPepsiProjects, getPepsiStatus, handlePepsiEvent } from './pepsi.service.js';
import { runPepsiSync } from './pepsi.sync.js';

const router = Router();
const M = MODULES.RRRMAS; // synced projects live in the RRRMAS module

const syncSchema = z.object({
  projects: z
    .array(
      z
        .object({
          externalId: z.string().min(1),
          name: z.string().min(1),
        })
        .passthrough() // full PEPSI wire shape accepted; service maps it
    )
    .min(1),
});

// {event, payload, occurredAt} — same envelope as the HRMS/ERP event inboxes.
const eventSchema = z.object({
  event: z.string().min(1),
  payload: z.any().optional(),
  occurredAt: z.string().optional(),
});

/**
 * @swagger
 * /integrations/pepsi/events:
 *   post:
 *     tags: [Integrations]
 *     summary: Inbound PEPSI event push (x-api-key) — coalesced pull on state change
 *     responses:
 *       200: { description: Event accepted (or ignored if unknown) }
 */
// NB machine-to-machine — dedicated PEPSI API key only, deliberately NO
// authenticate/JWT (must stay above the router.use(authenticate) below).
router.post(
  '/events',
  requireApiKeyFor('PEPSI_INTEGRATION_API_KEY'),
  validate({ body: eventSchema }),
  asyncHandler(async (req, res) => {
    const result = handlePepsiEvent(req.body.event, req.body.payload || {});
    return ApiResponse.ok(res, result, result.ignored ? 'Event ignored' : 'Event processed');
  })
);

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Integrations, description: External system sync (PEPSI portal) }
 */

/**
 * @swagger
 * /integrations/pepsi/sync:
 *   post:
 *     tags: [Integrations]
 *     summary: Upsert projects from the PEPSI execution portal (idempotent by externalId)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Sync result }
 */
router.post(
  '/sync',
  authorize(M, ACTIONS.UPDATE),
  validate({ body: syncSchema }),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'Project',
    describe: (req) => `PEPSI sync: ${req.body.projects.length} project(s)`,
  }),
  asyncHandler(async (req, res) => {
    const result = await upsertPepsiProjects(req.body.projects, req.user._id);
    broadcast('rrrmas:changed', { type: 'pepsi:sync', at: Date.now() });
    return ApiResponse.ok(res, result, 'PEPSI sync complete');
  })
);

/**
 * @swagger
 * /integrations/pepsi/pull:
 *   post:
 *     tags: [Integrations]
 *     summary: Server-initiated PEPSI sync — pulls from the live API, falls back to the bundled snapshot
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Sync result with source (api|snapshot) }
 */
router.post(
  '/pull',
  authorize(M, ACTIONS.UPDATE),
  auditAction({
    action: ACTIONS.UPDATE,
    module: M,
    entityType: 'Project',
    describe: () => 'PEPSI pull (API → snapshot fallback)',
  }),
  asyncHandler(async (req, res) => {
    const result = await runPepsiSync(req.user._id);
    broadcast('rrrmas:changed', { type: 'pepsi:pull', at: Date.now() });
    return ApiResponse.ok(res, result, `PEPSI pull complete (source: ${result.source})`);
  })
);

/**
 * @swagger
 * /integrations/pepsi/status:
 *   get:
 *     tags: [Integrations]
 *     summary: PEPSI sync status (project count, last synced)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/status',
  authorize(M, ACTIONS.READ),
  asyncHandler(async (_req, res) => {
    const status = await getPepsiStatus();
    return ApiResponse.ok(res, status, 'PEPSI status');
  })
);

export default router;
