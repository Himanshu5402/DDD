import mongoose from 'mongoose';
import JobPosition from '../../models/jobPosition.model.js';
import Candidate from '../../models/candidate.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

const POSITION_POPULATE = [
  { path: 'company', select: 'name code' },
  { path: 'hiringManager', select: 'name' },
];

const CANDIDATE_POPULATE = [{ path: 'position', select: 'title' }];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Positions ----------------------------------------------------------------

/** Build the Mongo filter for the positions list. */
function buildPositionFilter(query = {}) {
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.company) filter.company = query.company;

  if (query.department) {
    filter.department = new RegExp(escapeRegex(query.department), 'i');
  }

  return filter;
}

export async function listPositions(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildPositionFilter(query);

  const [items, total] = await Promise.all([
    JobPosition.find(filter).populate(POSITION_POPULATE).sort(sort).skip(skip).limit(limit),
    JobPosition.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function createPosition(data, user) {
  const position = await JobPosition.create({
    ...data,
    source: 'manual',
    createdBy: user._id,
  });

  return JobPosition.findById(position._id).populate(POSITION_POPULATE);
}

const POSITION_UPDATABLE = [
  'title',
  'department',
  'company',
  'openings',
  'priority',
  'status',
  'targetHireDate',
  'hiringManager',
  'description',
];

export async function updatePosition(id, data) {
  const position = await JobPosition.findById(id);
  if (!position) throw ApiError.notFound('Position not found');
  if (position.source === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');

  for (const f of POSITION_UPDATABLE) if (data[f] !== undefined) position[f] = data[f];

  await position.save();
  return JobPosition.findById(position._id).populate(POSITION_POPULATE);
}

export async function deletePosition(id) {
  const position = await JobPosition.findById(id);
  if (!position) throw ApiError.notFound('Position not found');
  if (position.source === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');

  const candidateCount = await Candidate.countDocuments({ position: position._id });
  if (candidateCount > 0) {
    throw ApiError.conflict(
      `Cannot delete: ${candidateCount} candidate(s) reference this position`
    );
  }

  await position.deleteOne();
  return { success: true };
}

// --- Candidates ---------------------------------------------------------------

/** Build the Mongo filter for the candidates list. */
function buildCandidateFilter(query = {}) {
  const filter = {};

  if (query.position) filter.position = query.position;
  if (query.stage) filter.stage = query.stage;

  return filter;
}

export async function listCandidates(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildCandidateFilter(query);

  const [items, total] = await Promise.all([
    Candidate.find(filter).populate(CANDIDATE_POPULATE).sort(sort).skip(skip).limit(limit),
    Candidate.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function createCandidate(data, user) {
  const position = await JobPosition.findById(data.position).select('_id');
  if (!position) throw ApiError.badRequest('Referenced position does not exist');

  const candidate = await Candidate.create({
    ...data,
    stageUpdatedAt: new Date(),
    sourceSystem: 'manual',
    createdBy: user._id,
  });

  return Candidate.findById(candidate._id).populate(CANDIDATE_POPULATE);
}

const CANDIDATE_UPDATABLE = [
  'name',
  'email',
  'phone',
  'position',
  'stage',
  'source',
  'expectedJoining',
  'rating',
  'notes',
];

export async function updateCandidate(id, data) {
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.sourceSystem === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');

  if (data.position !== undefined) {
    const position = await JobPosition.findById(data.position).select('_id');
    if (!position) throw ApiError.badRequest('Referenced position does not exist');
  }

  const stageChanged = data.stage !== undefined && data.stage !== candidate.stage;

  for (const f of CANDIDATE_UPDATABLE) if (data[f] !== undefined) candidate[f] = data[f];

  if (stageChanged) candidate.stageUpdatedAt = new Date();

  await candidate.save();
  return Candidate.findById(candidate._id).populate(CANDIDATE_POPULATE);
}

/** Move a candidate to a new pipeline stage, stamping stageUpdatedAt. */
export async function moveCandidateStage(id, stage) {
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.sourceSystem === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');

  candidate.stage = stage;
  candidate.stageUpdatedAt = new Date();

  await candidate.save();
  return Candidate.findById(candidate._id).populate(CANDIDATE_POPULATE);
}

export async function deleteCandidate(id) {
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.sourceSystem === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');

  await candidate.deleteOne();
  return { success: true };
}

// --- Summary ------------------------------------------------------------------

/**
 * Recruitment funnel metrics:
 *   openPositions, totalOpenings (sum on open reqs), funnel (candidate counts
 *   per stage), offersPending, hiresThisMonth and avgTimeToHireDays.
 */
export async function getSummary() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [positionAgg] = await JobPosition.aggregate([
    { $match: { status: 'open' } },
    {
      $group: {
        _id: null,
        openPositions: { $sum: 1 },
        totalOpenings: { $sum: '$openings' },
      },
    },
  ]);

  const funnelAgg = await Candidate.aggregate([
    { $group: { _id: '$stage', count: { $sum: 1 } } },
  ]);

  const [hireAgg] = await Candidate.aggregate([
    { $match: { stage: 'hired' } },
    {
      $group: {
        _id: null,
        avgTimeToHireMs: { $avg: { $subtract: ['$stageUpdatedAt', '$appliedAt'] } },
        hiresThisMonth: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$stageUpdatedAt', monthStart] },
                  { $lt: ['$stageUpdatedAt', nextMonthStart] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const funnel = Object.fromEntries(funnelAgg.map((s) => [s._id, s.count]));

  const avgMs = hireAgg?.avgTimeToHireMs || 0;
  const avgTimeToHireDays = avgMs > 0 ? Math.round(avgMs / 86400000) : 0;

  return {
    openPositions: positionAgg?.openPositions || 0,
    totalOpenings: positionAgg?.totalOpenings || 0,
    funnel,
    offersPending: funnel.offer || 0,
    hiresThisMonth: hireAgg?.hiresThisMonth || 0,
    avgTimeToHireDays,
  };
}

export function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}
