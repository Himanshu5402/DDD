import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import authorize from '../../middleware/authorize.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import auditAction from '../../middleware/audit.middleware.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import * as c from './recruitment.controller.js';
import {
  idParamSchema,
  listPositionsSchema,
  createPositionSchema,
  updatePositionSchema,
  listCandidatesSchema,
  createCandidateSchema,
  updateCandidateSchema,
  stageCandidateSchema,
} from './recruitment.validation.js';

const router = Router();
const M = MODULES.RECRUITMENT;

router.use(authenticate);

/**
 * @swagger
 * tags: { name: Recruitment, description: Hiring pipeline: job positions & candidates }
 */

// --- Positions ----------------------------------------------------------------

router.get(
  '/positions',
  authorize(M, ACTIONS.READ),
  validate({ query: listPositionsSchema }),
  c.listPositions
);

// Write-through create — the opening is created in the HRMS first (which
// assigns the JOB-## code), then mirrored here.
router.post(
  '/positions',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createPositionSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'JobPosition', describe: (req) => `Created HRMS opening "${req.body.title}"` }),
  c.createPosition
);

router.patch(
  '/positions/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updatePositionSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'JobPosition', entityId: (req) => req.params.id }),
  c.updatePosition
);

router.delete(
  '/positions/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'JobPosition', entityId: (req) => req.params.id }),
  c.removePosition
);

// --- Candidates ---------------------------------------------------------------

router.get(
  '/candidates',
  authorize(M, ACTIONS.READ),
  validate({ query: listCandidatesSchema }),
  c.listCandidates
);

// Write-through create — the candidate is created in the HRMS first (which
// assigns the CND-## code), then mirrored here.
router.post(
  '/candidates',
  authorize(M, ACTIONS.CREATE),
  validate({ body: createCandidateSchema }),
  auditAction({ action: ACTIONS.CREATE, module: M, entityType: 'Candidate', describe: (req) => `Added HRMS candidate "${req.body.name}"` }),
  c.createCandidate
);

// Stage move — literal sub-path, MUST precede '/candidates/:id'.
router.patch(
  '/candidates/:id/stage',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: stageCandidateSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Candidate', entityId: (req) => req.params.id, describe: (req) => `Moved candidate to ${req.body.stage}` }),
  c.moveCandidateStage
);

router.patch(
  '/candidates/:id',
  authorize(M, ACTIONS.UPDATE),
  validate({ params: idParamSchema, body: updateCandidateSchema }),
  auditAction({ action: ACTIONS.UPDATE, module: M, entityType: 'Candidate', entityId: (req) => req.params.id }),
  c.updateCandidate
);

router.delete(
  '/candidates/:id',
  authorize(M, ACTIONS.DELETE),
  validate({ params: idParamSchema }),
  auditAction({ action: ACTIONS.DELETE, module: M, entityType: 'Candidate', entityId: (req) => req.params.id }),
  c.removeCandidate
);

// --- Summary ------------------------------------------------------------------

router.get('/summary', authorize(M, ACTIONS.READ), c.summary);

export default router;
