import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';
import Company from '../../models/company.model.js';
import Task from '../../models/task.model.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

const router = Router();
const M = MODULES.COMPANIES;

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParamSchema = z.object({ id: objectId });

const upsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(10).toUpperCase(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Color must be a hex value like #4f46e5').optional(),
  description: z.string().max(300).optional(),
  isActive: z.boolean().optional(),
});

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Companies, description: The owner's companies (work is tagged per company) }
 */

// Any authenticated user can list companies — needed by pickers everywhere.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const companies = await Company.find({ isActive: true }).sort({ name: 1 });
    return ApiResponse.ok(res, { companies }, 'Companies');
  })
);

router.post(
  '/',
  authorize(M, ACTIONS.CREATE),
  validate({ body: upsertSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'Company', describe: (req) => `Created company ${req.body.name}` }),
  asyncHandler(async (req, res) => {
    const exists = await Company.findOne({ $or: [{ name: req.body.name }, { code: req.body.code }] });
    if (exists) throw ApiError.conflict('A company with that name or code already exists');
    const company = await Company.create({ ...req.body, createdBy: req.user._id });
    return ApiResponse.created(res, { company }, 'Company created');
  })
);

router.patch(
  '/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: upsertSchema.partial() }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Company', entityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!company) throw ApiError.notFound('Company not found');
    return ApiResponse.ok(res, { company }, 'Company updated');
  })
);

router.delete(
  '/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Company', entityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    const inUse = await Task.countDocuments({ company: req.params.id });
    if (inUse > 0) {
      throw ApiError.badRequest(`Company has ${inUse} task(s); reassign or delete them first`);
    }
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) throw ApiError.notFound('Company not found');
    return ApiResponse.ok(res, null, 'Company deleted');
  })
);

export default router;
