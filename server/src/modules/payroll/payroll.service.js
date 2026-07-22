import mongoose from 'mongoose';
import PayrollPeriod from '../../models/payrollPeriod.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import * as hrms from '../../services/integrations/hrms.client.js';

const LIST_POPULATE = [{ path: 'company', select: 'name code' }];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the Mongo filter for the payroll periods list. */
function buildFilter(query = {}) {
  const filter = {};

  if (query.company) filter.company = query.company;
  if (query.status) filter.status = query.status;

  if (query.month) {
    const rx = new RegExp(escapeRegex(query.month), 'i');
    filter.$or = [{ month: rx }];
  }

  return filter;
}

export async function listPeriods(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query);

  // Owner cost view is chronological: newest month first unless overridden.
  const effectiveSort = query.sort ? sort : { month: -1 };

  const [items, total] = await Promise.all([
    PayrollPeriod.find(filter).populate(LIST_POPULATE).sort(effectiveSort).skip(skip).limit(limit),
    PayrollPeriod.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function createPeriod(data, user) {
  try {
    const period = await PayrollPeriod.create({
      ...data,
      source: 'manual',
      createdBy: user._id,
    });
    return PayrollPeriod.findById(period._id).populate(LIST_POPULATE);
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.conflict('A payroll period already exists for this month and company');
    }
    throw err;
  }
}

const UPDATABLE = [
  'status',
  'currency',
  'totalCost',
  'headcount',
  'byDepartment',
  'reimbursementsPending',
  'reimbursementsAmount',
];

export async function updatePeriod(id, data) {
  const period = await PayrollPeriod.findById(id);
  if (!period) throw ApiError.notFound('Payroll period not found');
  if (period.source === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');

  for (const f of UPDATABLE) if (data[f] !== undefined) period[f] = data[f];

  await period.save();
  return PayrollPeriod.findById(period._id).populate(LIST_POPULATE);
}

export async function deletePeriod(id) {
  const period = await PayrollPeriod.findById(id);
  if (!period) throw ApiError.notFound('Payroll period not found');
  if (period.source === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');
  await period.deleteOne();
  return { success: true };
}

// HRMS run status → DDD PayrollPeriod status (contract enum map).
const HRMS_RUN_STATUS = { Pending: 'draft', Processing: 'processing', Paid: 'paid' };

/**
 * Owner "Run payroll" — write-through to the HRMS, which marks every active
 * employee paid for the month and echoes a `payroll.changed` event carrying the
 * fresh aggregates (that echo upserts the full mirror row). The status we get
 * back is converged onto an existing mirror row immediately; on HRMS failure
 * the ApiError from hrms.client propagates and nothing is mutated.
 */
export async function runPayrollInHrms(month) {
  const res = await hrms.post('/integration/payroll/run', { month });
  const run = res?.data ?? null;

  if (run?.month) {
    // The run response has no aggregates — update only the status here and let
    // the echo event (or the next sync) refresh cost/headcount/byDepartment.
    await PayrollPeriod.updateOne(
      { month: run.month, source: 'hrms' },
      { $set: { status: HRMS_RUN_STATUS[run.status] || 'processing' } }
    );
  }

  const period = await PayrollPeriod.findOne({ month, source: 'hrms' }).populate(LIST_POPULATE);
  return { run, period };
}

/**
 * Owner metrics: the latest month's cost snapshot plus a 6-month cost trend.
 */
export async function getSummary() {
  const latest = await PayrollPeriod.findOne().sort({ month: -1 });

  const recent = await PayrollPeriod.find().sort({ month: -1 }).limit(6).select('month totalCost');
  const trend = recent
    .map((p) => ({ month: p.month, totalCost: p.totalCost }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  return {
    latest: latest
      ? {
          month: latest.month,
          totalCost: latest.totalCost,
          headcount: latest.headcount,
          byDepartment: latest.byDepartment,
          reimbursementsPending: latest.reimbursementsPending,
          reimbursementsAmount: latest.reimbursementsAmount,
          currency: latest.currency,
        }
      : null,
    trend,
  };
}

export function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}
