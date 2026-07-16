import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { parsePagination } from '../../utils/pagination.js';
import AuditLog from '../../models/auditLog.model.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

const router = Router();
const M = MODULES.AUDIT;

const listSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  sort: z.string().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  actor: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  status: z.enum(['success', 'failure']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Audit, description: Immutable audit trail }
 */
router.get(
  '/',
  authorize(M, ACTIONS.READ),
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, sort } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const filter = {};
    if (req.query.module) filter.module = req.query.module;
    if (req.query.action) filter.action = req.query.action;
    if (req.query.actor) filter.actor = req.query.actor;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = req.query.from;
      if (req.query.to) filter.createdAt.$lte = req.query.to;
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).populate('actor', 'name email').sort(sort).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return ApiResponse.paginated(res, items, { page, limit, total }, 'Audit log');
  })
);

export default router;
