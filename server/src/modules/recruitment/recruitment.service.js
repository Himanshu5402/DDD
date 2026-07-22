import mongoose from 'mongoose';
import JobPosition from '../../models/jobPosition.model.js';
import Candidate from '../../models/candidate.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import * as hrms from '../../services/integrations/hrms.client.js';
import { upsertOpening, upsertCandidate } from '../integrations/hrmsSync.service.js';

const POSITION_POPULATE = [
  { path: 'company', select: 'name code' },
  { path: 'hiringManager', select: 'name' },
];

const CANDIDATE_POPULATE = [{ path: 'position', select: 'title' }];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- HRMS write-through helpers -----------------------------------------------
// Reverse enum maps (DDD → HRMS) per the integration contract. HRMS has no
// 'dropped' stage (→ 'Rejected') and its openings are binary Open/Closed
// ('on_hold' stays Open, 'filled' closes).

const HRMS_STAGE = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  dropped: 'Rejected',
};

const HRMS_OPENING_STATUS = { open: 'Open', on_hold: 'Open', closed: 'Closed', filled: 'Closed' };

/** Date → HRMS 'YYYY-MM-DD' string (local time). */
function toYmd(value) {
  const d = new Date(value);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** DDD position fields → HRMS opening body (only mappable fields present in data). */
function toHrmsOpeningBody(data) {
  const body = {};
  if (data.title !== undefined) body.title = data.title;
  if (data.department !== undefined) body.dept = data.department;
  if (data.openings !== undefined) body.positions = data.openings;
  if (data.status !== undefined) body.status = HRMS_OPENING_STATUS[data.status] || 'Open';
  if (data.openSince !== undefined) body.posted = toYmd(data.openSince);
  // The mirror stores HRMS `exp` as description "Experience: X" — strip it back.
  if (data.description !== undefined) {
    body.exp = String(data.description).replace(/^Experience:\s*/i, '');
  }
  return body;
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

/**
 * Owner creates an opening from DDD. The HRMS owns recruitment data, so the
 * opening is created there FIRST (which assigns the JOB-## code), then mirrored
 * locally from the returned doc (keyed on externalId=code, source 'hrms').
 * DDD-only fields (priority, target hire date, hiring manager) live on the
 * mirror. If the HRMS is unreachable the 502 propagates and nothing is
 * created — never a silent local-only manual row. The echo event the HRMS
 * emits converges the same row (idempotent upsert on externalId).
 */
export async function createPosition(data) {
  const body = toHrmsOpeningBody(data);
  if (!body.posted) body.posted = toYmd(new Date()); // contract: posted today

  const res = await hrms.post('/integration/openings', body);
  const doc = res?.data;
  if (!doc?.code) {
    throw new ApiError(502, 'HRMS did not return the created opening', { code: 'HRMS_ERROR' });
  }

  const position = await upsertOpening(doc);
  if (!position) {
    throw ApiError.internal('Opening created in HRMS but the mirror upsert failed — run a sync');
  }

  // DDD-only fields live on the mirror (the sync upserts never touch them).
  let localTouched = false;
  for (const f of POSITION_LOCAL_ONLY) {
    if (data[f] !== undefined) {
      position[f] = data[f];
      localTouched = true;
    }
  }
  if (localTouched) await position.save();

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

// Fields that only exist on the DDD mirror — safe to edit locally on HRMS rows
// (the sync upserts never touch them).
const POSITION_LOCAL_ONLY = ['priority', 'targetHireDate', 'hiringManager'];

export async function updatePosition(id, data) {
  const position = await JobPosition.findById(id);
  if (!position) throw ApiError.notFound('Position not found');

  if (position.source === 'hrms') {
    // Write-through: forward the mappable fields to the HRMS (which owns this
    // row), then refresh the mirror from its response. The echo event the HRMS
    // emits converges the mirror again — upserts are idempotent. On HRMS
    // failure the ApiError propagates and the mirror is untouched.
    if (!position.externalId) {
      throw ApiError.conflict('HRMS position has no external reference — run a sync first');
    }
    const hrmsBody = toHrmsOpeningBody(data);
    if (Object.keys(hrmsBody).length > 0) {
      const res = await hrms.put(
        `/integration/openings/${encodeURIComponent(position.externalId)}`,
        hrmsBody
      );
      if (res?.data?.code) await upsertOpening(res.data);
    }

    // DDD-only fields (priority, target hire date, hiring manager) live on the mirror.
    const fresh = await JobPosition.findById(id);
    let localTouched = false;
    for (const f of POSITION_LOCAL_ONLY) {
      if (data[f] !== undefined) {
        fresh[f] = data[f];
        localTouched = true;
      }
    }
    if (localTouched) await fresh.save();

    return JobPosition.findById(id).populate(POSITION_POPULATE);
  }

  for (const f of POSITION_UPDATABLE) if (data[f] !== undefined) position[f] = data[f];

  await position.save();
  return JobPosition.findById(position._id).populate(POSITION_POPULATE);
}

export async function deletePosition(id) {
  const position = await JobPosition.findById(id);
  if (!position) throw ApiError.notFound('Position not found');

  const candidateCount = await Candidate.countDocuments({ position: position._id });
  if (candidateCount > 0) {
    throw ApiError.conflict(
      `Cannot delete: ${candidateCount} candidate(s) reference this position`
    );
  }

  if (position.source === 'hrms') {
    // Write-through: soft-delete in the HRMS first; only then drop the mirror.
    if (!position.externalId) {
      throw ApiError.conflict('HRMS position has no external reference — run a sync first');
    }
    await hrms.del(`/integration/openings/${encodeURIComponent(position.externalId)}`);
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

// Fields that only exist on the DDD mirror — kept locally on create (the sync
// upserts never touch them).
const CANDIDATE_LOCAL_ONLY = ['email', 'source', 'expectedJoining', 'rating', 'notes'];

/**
 * Owner adds a candidate from DDD. The HRMS owns recruitment data, so the
 * candidate is created there FIRST (which assigns the CND-## code) against the
 * referenced position's title, then mirrored locally from the returned doc
 * (keyed on externalId=code, sourceSystem 'hrms'). DDD-only fields (email,
 * source, expected joining, rating, notes) live on the mirror. If the HRMS is
 * unreachable the 502 propagates and nothing is created — never a silent
 * local-only manual row.
 */
export async function createCandidate(data) {
  const position = await JobPosition.findById(data.position).select('title');
  if (!position) throw ApiError.badRequest('Referenced position does not exist');

  const body = { name: data.name, job: position.title };
  if (data.phone !== undefined) body.phone = data.phone;
  if (data.stage !== undefined) body.stage = HRMS_STAGE[data.stage] || 'Applied';
  body.applied = toYmd(data.appliedAt !== undefined ? data.appliedAt : new Date());

  const res = await hrms.post('/integration/candidates', body);
  const doc = res?.data;
  if (!doc?.code) {
    throw new ApiError(502, 'HRMS did not return the created candidate', { code: 'HRMS_ERROR' });
  }

  const candidate = await upsertCandidate(doc);
  if (!candidate) {
    throw ApiError.internal('Candidate created in HRMS but the mirror upsert failed — run a sync');
  }

  // DDD-only fields live on the mirror (the sync upserts never touch them).
  let localTouched = false;
  for (const f of CANDIDATE_LOCAL_ONLY) {
    if (data[f] !== undefined) {
      candidate[f] = data[f];
      localTouched = true;
    }
  }
  if (localTouched) await candidate.save();

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
  if (candidate.sourceSystem === 'hrms') {
    // The HRMS only supports stage moves on candidates — forward a pure stage
    // change, keep everything else read-only.
    const changed = CANDIDATE_UPDATABLE.filter((f) => data[f] !== undefined);
    if (changed.length === 1 && changed[0] === 'stage') {
      return moveCandidateStage(id, data.stage);
    }
    throw ApiError.conflict('Managed by HRMS — only stage moves sync back');
  }

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

/**
 * Move a candidate to a new pipeline stage, stamping stageUpdatedAt.
 *
 * HRMS-mirrored candidates write through: the reverse-mapped stage is forwarded
 * to the HRMS first (DDD 'dropped' → HRMS 'Rejected'), then the mirror is
 * refreshed from its response so it converges with the echo event. On HRMS
 * failure the ApiError propagates and the mirror is untouched.
 */
export async function moveCandidateStage(id, stage) {
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');

  if (candidate.sourceSystem === 'hrms') {
    if (!candidate.externalId) {
      throw ApiError.conflict('HRMS candidate has no external reference — run a sync first');
    }
    const res = await hrms.patch(
      `/integration/candidates/${encodeURIComponent(candidate.externalId)}/stage`,
      { stage: HRMS_STAGE[stage] || 'Applied' }
    );
    if (res?.data?.code) {
      await upsertCandidate(res.data);
    } else {
      candidate.stage = stage;
      candidate.stageUpdatedAt = new Date();
      await candidate.save();
    }
    return Candidate.findById(candidate._id).populate(CANDIDATE_POPULATE);
  }

  candidate.stage = stage;
  candidate.stageUpdatedAt = new Date();

  await candidate.save();
  return Candidate.findById(candidate._id).populate(CANDIDATE_POPULATE);
}

export async function deleteCandidate(id) {
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');

  if (candidate.sourceSystem === 'hrms') {
    // Write-through: soft-delete in the HRMS first; only then drop the mirror.
    if (!candidate.externalId) {
      throw ApiError.conflict('HRMS candidate has no external reference — run a sync first');
    }
    await hrms.del(`/integration/candidates/${encodeURIComponent(candidate.externalId)}`);
  }

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
