import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { getAI } from '../../services/ai/index.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

const router = Router();
const M = MODULES.AI;

const askSchema = z.object({
  prompt: z.string().min(1).max(8000),
  system: z.string().max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(8192).optional(),
});

router.use(authenticate);

/**
 * @swagger
 * tags: { name: AI, description: AI Intelligence Layer (vendor-neutral copilot) }
 */

/**
 * @swagger
 * /ai/ask:
 *   post:
 *     tags: [AI]
 *     summary: Ask the configured AI provider a question
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Completion result }
 */
router.post(
  '/ask',
  authorize(M, ACTIONS.READ),
  validate({ body: askSchema }),
  asyncHandler(async (req, res) => {
    const ai = getAI();
    const result = await ai.ask(req.body.prompt, {
      system: req.body.system,
      temperature: req.body.temperature,
      maxTokens: req.body.maxTokens,
    });
    return ApiResponse.ok(res, result, 'AI completion');
  })
);

/**
 * @swagger
 * /ai/status:
 *   get:
 *     tags: [AI]
 *     summary: Which AI provider is active
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/status',
  authorize(M, ACTIONS.READ),
  asyncHandler(async (_req, res) => {
    const ai = getAI();
    return ApiResponse.ok(res, { provider: ai.name, configured: ai.isConfigured() }, 'AI status');
  })
);

export default router;
