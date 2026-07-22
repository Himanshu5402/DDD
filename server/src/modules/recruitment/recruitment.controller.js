import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { broadcast } from '../../socket/index.js';
import * as service from './recruitment.service.js';

/** Notify connected clients that recruitment data changed so they can refetch. */
function emitChange(type, id) {
  broadcast('recruitment:changed', { type, id: String(id), at: Date.now() });
}

// --- Positions ----------------------------------------------------------------

export const listPositions = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listPositions(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Positions');
});

export const createPosition = asyncHandler(async (req, res) => {
  const position = await service.createPosition(req.body);
  emitChange('position_created', position._id);
  return ApiResponse.created(res, { position }, 'Opening created in HRMS');
});

export const updatePosition = asyncHandler(async (req, res) => {
  const position = await service.updatePosition(req.params.id, req.body);
  emitChange('position_updated', position._id);
  return ApiResponse.ok(res, { position }, 'Position updated');
});

export const removePosition = asyncHandler(async (req, res) => {
  await service.deletePosition(req.params.id);
  emitChange('position_deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Position deleted');
});

// --- Candidates ---------------------------------------------------------------

export const listCandidates = asyncHandler(async (req, res) => {
  const { items, page, limit, total } = await service.listCandidates(req.query);
  return ApiResponse.paginated(res, items, { page, limit, total }, 'Candidates');
});

export const createCandidate = asyncHandler(async (req, res) => {
  const candidate = await service.createCandidate(req.body);
  emitChange('candidate_created', candidate._id);
  return ApiResponse.created(res, { candidate }, 'Candidate created in HRMS');
});

export const updateCandidate = asyncHandler(async (req, res) => {
  const candidate = await service.updateCandidate(req.params.id, req.body);
  emitChange('candidate_updated', candidate._id);
  return ApiResponse.ok(res, { candidate }, 'Candidate updated');
});

export const moveCandidateStage = asyncHandler(async (req, res) => {
  const candidate = await service.moveCandidateStage(req.params.id, req.body.stage);
  emitChange('candidate_updated', candidate._id);
  return ApiResponse.ok(res, { candidate }, 'Candidate stage updated');
});

export const removeCandidate = asyncHandler(async (req, res) => {
  await service.deleteCandidate(req.params.id);
  emitChange('candidate_deleted', req.params.id);
  return ApiResponse.ok(res, null, 'Candidate deleted');
});

// --- Summary ------------------------------------------------------------------

export const summary = asyncHandler(async (req, res) => {
  const data = await service.getSummary();
  return ApiResponse.ok(res, data, 'Recruitment summary');
});
