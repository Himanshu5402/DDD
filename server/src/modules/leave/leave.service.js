import mongoose from 'mongoose';
import LeaveRequest, { LEAVE_TYPES } from '../../models/leaveRequest.model.js';
import LeaveBalance from '../../models/leaveBalance.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import * as hrms from '../../services/integrations/hrms.client.js';

const REQUEST_POPULATE = [
  { path: 'user', select: 'name email avatar' },
  { path: 'approver', select: 'name email avatar' },
];

const BALANCE_POPULATE = [{ path: 'user', select: 'name email avatar' }];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the Mongo filter for the leave-requests list. */
function buildRequestFilter(query = {}) {
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.leaveType) filter.leaveType = query.leaveType;
  if (query.user) filter.user = query.user;

  if (query.from || query.to) {
    filter.fromDate = {};
    if (query.from) filter.fromDate.$gte = new Date(query.from);
    if (query.to) filter.fromDate.$lte = new Date(query.to);
  }

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ reason: rx }, { hrmsId: rx }];
  }

  return filter;
}

export async function listRequests(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildRequestFilter(query);

  const [items, total] = await Promise.all([
    LeaveRequest.find(filter).populate(REQUEST_POPULATE).sort(sort).skip(skip).limit(limit),
    LeaveRequest.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function createRequest(data, user) {
  const request = await LeaveRequest.create({
    ...data,
    source: 'manual',
    appliedAt: new Date(),
    createdBy: user._id,
  });

  return LeaveRequest.findById(request._id).populate(REQUEST_POPULATE);
}

const UPDATABLE = ['leaveType', 'fromDate', 'toDate', 'days', 'status', 'reason', 'approver'];

export async function updateRequest(id, data) {
  const request = await LeaveRequest.findById(id);
  if (!request) throw ApiError.notFound('Leave request not found');
  if (request.source === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');

  for (const f of UPDATABLE) if (data[f] !== undefined) request[f] = data[f];

  await request.save();
  return LeaveRequest.findById(request._id).populate(REQUEST_POPULATE);
}

/**
 * Approve or reject a request, stamping the deciding user as approver.
 *
 * HRMS-mirrored rows write through: the decision is forwarded to the HRMS
 * (the source of truth), and the mirror is only updated once it accepts —
 * the employee sees the outcome in the HRMS portal, and the echo event the
 * HRMS emits converges the mirror again (idempotent). If the HRMS is
 * unreachable the 502 from hrms.client propagates and nothing is mutated.
 */
export async function decideRequest(id, decision, user) {
  const request = await LeaveRequest.findById(id);
  if (!request) throw ApiError.notFound('Leave request not found');

  if (request.source === 'hrms') {
    if (!request.externalId) {
      throw ApiError.conflict('HRMS leave has no external reference — run a sync first');
    }
    const action = decision === 'approved' ? 'approve' : 'reject';
    await hrms.patch(`/integration/leaves/${encodeURIComponent(request.externalId)}/${action}`);
  }

  request.status = decision;
  request.approver = user._id;

  await request.save();
  return LeaveRequest.findById(request._id).populate(REQUEST_POPULATE);
}

export async function deleteRequest(id) {
  const request = await LeaveRequest.findById(id);
  if (!request) throw ApiError.notFound('Leave request not found');
  if (request.source === 'hrms') throw ApiError.conflict('Managed by HRMS — read only');
  await request.deleteOne();
  return { success: true };
}

/** Build the Mongo filter for the leave-balances list. */
function buildBalanceFilter(query = {}) {
  const filter = {};
  if (query.user) filter.user = query.user;
  if (query.year) filter.year = query.year;
  return filter;
}

export async function listBalances(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildBalanceFilter(query);

  const [items, total] = await Promise.all([
    LeaveBalance.find(filter).populate(BALANCE_POPULATE).sort(sort).skip(skip).limit(limit),
    LeaveBalance.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

/** Owner "who's out" metrics: today, pending approvals, upcoming, and by-type. */
export async function getSummary(query = {}) {
  const now = new Date();
  const year = query.year || now.getFullYear();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const [onLeaveToday, pendingApprovals, upcomingThisWeek, byTypeRows] = await Promise.all([
    LeaveRequest.countDocuments({
      status: 'approved',
      fromDate: { $lte: todayEnd },
      toDate: { $gte: todayStart },
    }),
    LeaveRequest.countDocuments({ status: 'pending' }),
    LeaveRequest.countDocuments({
      status: 'approved',
      fromDate: { $gte: todayStart, $lt: weekEnd },
    }),
    LeaveRequest.aggregate([
      { $match: { fromDate: { $gte: yearStart, $lt: yearEnd } } },
      { $group: { _id: '$leaveType', count: { $sum: 1 } } },
    ]),
  ]);

  const byType = Object.fromEntries(LEAVE_TYPES.map((t) => [t, 0]));
  for (const row of byTypeRows) if (row._id in byType) byType[row._id] = row.count;

  return { onLeaveToday, pendingApprovals, upcomingThisWeek, byType, year };
}

export function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}
