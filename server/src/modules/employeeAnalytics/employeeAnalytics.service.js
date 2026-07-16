import mongoose from 'mongoose';
import EmployeeRecord from '../../models/employeeRecord.model.js';
import User from '../../models/user.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

const USER_POPULATE = { path: 'user', select: 'name email department designation' };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalize a date to the start of its (UTC) day so {user, date} is unique per day. */
function startOfDay(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Resolve a {from, to} day range from query params (defaults: last 30 days). */
function resolveRange(query = {}) {
  const to = startOfDay(query.to || new Date());
  const from = query.from ? startOfDay(query.from) : new Date(to.getTime() - 30 * DAY_MS);
  return { from, to };
}

const round = (value, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round((value || 0) * factor) / factor;
};

/** Build the Mongo filter for listing records. */
function buildFilter(query = {}) {
  const filter = {};
  if (query.user) filter.user = query.user;
  if (query.attendance) filter.attendance = query.attendance;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = startOfDay(query.from);
    if (query.to) filter.date.$lte = startOfDay(query.to);
  }
  return filter;
}

export async function listRecords(query) {
  const { page, limit, skip, sort } = parsePagination(
    { ...query, sort: query.sort || '-date' },
    { defaultLimit: 25 }
  );
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    EmployeeRecord.find(filter).populate(USER_POPULATE).sort(sort).skip(skip).limit(limit),
    EmployeeRecord.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function createRecord(data, user) {
  const date = startOfDay(data.date);

  const existing = await EmployeeRecord.findOne({ user: data.user, date });
  if (existing) {
    throw ApiError.conflict('A record for this employee on this date already exists');
  }

  try {
    const record = await EmployeeRecord.create({ ...data, date, createdBy: user._id });
    return EmployeeRecord.findById(record._id).populate(USER_POPULATE);
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.conflict('A record for this employee on this date already exists');
    }
    throw err;
  }
}

const UPDATABLE = [
  'user',
  'attendance',
  'hoursWorked',
  'kpis',
  'productivityScore',
  'skills',
  'notes',
  'source',
];

export async function updateRecord(id, data) {
  const record = await EmployeeRecord.findById(id);
  if (!record) throw ApiError.notFound('Employee record not found');

  for (const f of UPDATABLE) if (data[f] !== undefined) record[f] = data[f];
  if (data.date !== undefined) record.date = startOfDay(data.date);

  // Guard the unique {user, date} pair when either changes.
  if (data.user !== undefined || data.date !== undefined) {
    const duplicate = await EmployeeRecord.findOne({
      user: record.user,
      date: record.date,
      _id: { $ne: record._id },
    });
    if (duplicate) {
      throw ApiError.conflict('A record for this employee on this date already exists');
    }
  }

  try {
    await record.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.conflict('A record for this employee on this date already exists');
    }
    throw err;
  }
  return EmployeeRecord.findById(record._id).populate(USER_POPULATE);
}

export async function deleteRecord(id) {
  const record = await EmployeeRecord.findById(id);
  if (!record) throw ApiError.notFound('Employee record not found');
  await record.deleteOne();
  return { success: true };
}

/** Per-employee attendance/productivity summary over a date range. */
export async function getSummary(query) {
  const { from, to } = resolveRange(query);

  const user = await User.findById(query.user).select('name email department designation');
  if (!user) throw ApiError.notFound('User not found');

  const [result] = await EmployeeRecord.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(query.user)),
        date: { $gte: from, $lte: to },
      },
    },
    {
      $facet: {
        days: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              present: { $sum: { $cond: [{ $eq: ['$attendance', 'present'] }, 1, 0] } },
              absent: { $sum: { $cond: [{ $eq: ['$attendance', 'absent'] }, 1, 0] } },
              leave: { $sum: { $cond: [{ $eq: ['$attendance', 'leave'] }, 1, 0] } },
              wfh: { $sum: { $cond: [{ $eq: ['$attendance', 'wfh'] }, 1, 0] } },
              half_day: { $sum: { $cond: [{ $eq: ['$attendance', 'half_day'] }, 1, 0] } },
              holiday: { $sum: { $cond: [{ $eq: ['$attendance', 'holiday'] }, 1, 0] } },
              avgHours: { $avg: '$hoursWorked' },
              avgProductivity: { $avg: '$productivityScore' },
            },
          },
        ],
        kpis: [
          { $unwind: '$kpis' },
          { $group: { _id: '$kpis.name', avgScore: { $avg: '$kpis.score' } } },
          { $project: { _id: 0, name: '$_id', avgScore: { $round: ['$avgScore', 1] } } },
          { $sort: { avgScore: -1 } },
        ],
      },
    },
  ]);

  const stats = result?.days?.[0] || {};
  const days = {
    total: stats.total || 0,
    present: stats.present || 0,
    absent: stats.absent || 0,
    leave: stats.leave || 0,
    wfh: stats.wfh || 0,
    half_day: stats.half_day || 0,
    holiday: stats.holiday || 0,
  };

  // Attendance % counts present + wfh fully and half days at 0.5, over working days (holidays excluded).
  const workingDays = days.total - days.holiday;
  const attendancePct =
    workingDays > 0 ? round(((days.present + days.wfh + days.half_day * 0.5) / workingDays) * 100) : 0;

  return {
    user,
    range: { from, to },
    days,
    attendancePct,
    avgHours: round(stats.avgHours, 2),
    avgProductivity: round(stats.avgProductivity),
    kpiAverages: result?.kpis || [],
  };
}

/** Team-wide analytics grouped by employee, ranked by average productivity. */
export async function getTeam(query) {
  const { from, to } = resolveRange(query);

  const team = await EmployeeRecord.aggregate([
    { $match: { date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: '$user',
        presentDays: { $sum: { $cond: [{ $eq: ['$attendance', 'present'] }, 1, 0] } },
        avgHours: { $avg: '$hoursWorked' },
        avgProductivity: { $avg: '$productivityScore' },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        name: '$user.name',
        email: '$user.email',
        department: '$user.department',
        presentDays: 1,
        avgHours: { $round: [{ $ifNull: ['$avgHours', 0] }, 2] },
        avgProductivity: { $round: [{ $ifNull: ['$avgProductivity', 0] }, 1] },
      },
    },
    { $sort: { avgProductivity: -1 } },
  ]);

  return { range: { from, to }, team };
}

/**
 * HRMS sync stub — the integration point for external HRMS APIs. When an HRMS
 * is configured this should pull attendance/hours and upsert EmployeeRecords
 * with source 'hrms'.
 */
export async function hrmsSync() {
  return { synced: 0, status: 'not_configured' };
}
