import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import { dailyBrief, intelligentSearch } from './insights.service.js';

const router = Router();
const M = MODULES.AI;

const searchSchema = z.object({
  query: z.string().min(2).max(200),
  withSynthesis: z.boolean().optional(),
});

router.use(authenticate);

/**
 * @swagger
 * tags: { name: AI Insights, description: Cross-module AI insights & intelligent search (Module 9) }
 */

/**
 * @swagger
 * /ai/insights/daily-brief:
 *   post:
 *     tags: [AI Insights]
 *     summary: AI chief-of-staff brief across every module the caller can read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ brief, provider, snapshot }" }
 */
router.post(
  '/daily-brief',
  authorize(M, ACTIONS.READ),
  asyncHandler(async (req, res) => {
    const data = await dailyBrief(req.user, req.permissions, req.isSuperAdmin);
    return ApiResponse.ok(res, data, 'Daily brief');
  })
);

/**
 * @swagger
 * /ai/insights/search:
 *   post:
 *     tags: [AI Insights]
 *     summary: Permission-aware intelligent search across all business collections
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ query, results, totalHits, synthesis, provider }" }
 */
router.post(
  '/search',
  authorize(M, ACTIONS.READ),
  validate({ body: searchSchema }),
  asyncHandler(async (req, res) => {
    const data = await intelligentSearch(req.body.query, req.permissions, req.isSuperAdmin, {
      withSynthesis: req.body.withSynthesis !== false,
      user: req.user,
    });
    return ApiResponse.ok(res, data, 'Intelligent search');
  })
);

export default router;
