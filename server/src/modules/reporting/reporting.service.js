import DailyReport from '../../models/dailyReport.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import { getAI } from '../../services/ai/index.js';

const USER_POPULATE = {
  path: 'user',
  select: 'name email department designation company',
  populate: { path: 'company', select: 'name code color' },
};
const REVIEWER_POPULATE = { path: 'reviewedBy', select: 'name email' };
const TASKS_POPULATE = { path: 'tasksWorked', select: 'title status' };

/** Normalize any date to local start of day so one report maps to one day. */
function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Owner or an employee_analytics reader (manager/admin) may view a report. */
function assertCanView(report, user, { permissions, isSuperAdmin } = {}) {
  if (isSuperAdmin) return;
  const ownerId = String(report.user?._id ?? report.user);
  if (ownerId === String(user._id)) return;
  const perms = permissions || new Set();
  if (
    perms.has(`${MODULES.EMPLOYEE_ANALYTICS}:${ACTIONS.READ}`) ||
    perms.has(`${MODULES.EMPLOYEE_ANALYTICS}:${ACTIONS.MANAGE}`)
  ) {
    return;
  }
  throw ApiError.forbidden('You can only view your own reports');
}

const SUBMITTABLE = [
  'workDone', 'tomorrowPlan', 'blockers', 'hoursWorked',
  'meetings', 'gitCommits', 'tasksWorked', 'remarks', 'mood',
];

/** Upsert the caller's report for the given day (defaults to today). */
export async function submitReport(data, user) {
  const date = startOfDay(data.date || new Date());

  const existing = await DailyReport.findOne({ user: user._id, date });
  if (existing) {
    for (const f of SUBMITTABLE) if (data[f] !== undefined) existing[f] = data[f];
    await existing.save();
    return { report: existing, created: false };
  }

  const payload = { user: user._id, date };
  for (const f of SUBMITTABLE) if (data[f] !== undefined) payload[f] = data[f];
  const report = await DailyReport.create(payload);
  return { report, created: true };
}

export async function listMine(query, user) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 20 });
  // Default to newest report first (by report day, not creation time).
  const effectiveSort = typeof query.sort === 'string' && query.sort.trim() ? sort : { date: -1 };

  const filter = { user: user._id };
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = startOfDay(query.from);
    if (query.to) filter.date.$lte = startOfDay(query.to);
  }

  const [items, total] = await Promise.all([
    DailyReport.find(filter).populate(REVIEWER_POPULATE).sort(effectiveSort).skip(skip).limit(limit),
    DailyReport.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

/** All reports submitted for one day (defaults to today), sorted by user name. */
export async function getTeamReports(query = {}) {
  const date = startOfDay(query.date || new Date());
  const reports = await DailyReport.find({ date }).populate([USER_POPULATE, REVIEWER_POPULATE]);
  reports.sort((a, b) => (a.user?.name || '').localeCompare(b.user?.name || ''));
  return { date, reports };
}

export async function getReport(id, user, ctx = {}) {
  const report = await DailyReport.findById(id).populate([USER_POPULATE, REVIEWER_POPULATE, TASKS_POPULATE]);
  if (!report) throw ApiError.notFound('Report not found');
  assertCanView(report, user, ctx);
  return report;
}

export async function reviewReport(id, user) {
  const report = await DailyReport.findById(id);
  if (!report) throw ApiError.notFound('Report not found');

  report.status = 'reviewed';
  report.reviewedBy = user._id;
  report.reviewedAt = new Date();
  await report.save();

  return DailyReport.findById(report._id).populate([USER_POPULATE, REVIEWER_POPULATE]);
}

/** AI summary of one report for its manager; persisted on the report. */
export async function aiSummary(id, user, ctx = {}) {
  const report = await getReport(id, user, ctx);
  const ai = getAI();

  const lines = [
    `Employee: ${report.user?.name || 'Unknown'}`,
    `Date: ${new Date(report.date).toDateString()}`,
    `Hours worked: ${report.hoursWorked} | Mood: ${report.mood}`,
    `Work done: ${report.workDone}`,
    report.tomorrowPlan ? `Tomorrow plan: ${report.tomorrowPlan}` : null,
    report.blockers ? `Blockers: ${report.blockers}` : null,
    report.meetings?.length
      ? `Meetings: ${report.meetings.map((m) => `${m.title} (${m.durationMinutes}m)`).join('; ')}`
      : null,
    report.gitCommits?.length
      ? `Commits: ${report.gitCommits.map((c) => `${c.repo ? `[${c.repo}] ` : ''}${c.message}`).join('; ')}`
      : null,
    report.tasksWorked?.length
      ? `Tasks worked: ${report.tasksWorked.map((t) => `${t.title} (${t.status})`).join(', ')}`
      : null,
    report.remarks ? `Remarks: ${report.remarks}` : null,
  ].filter(Boolean);

  const result = await ai.complete({
    system:
      'You summarize an employee daily report for their manager: key accomplishments, ' +
      'risks/blockers, and tomorrow focus in 3 short bullets.',
    messages: [{ role: 'user', content: lines.join('\n') }],
    maxTokens: 400,
  });

  report.aiSummary = result.text;
  await report.save();

  return { summary: result.text, provider: result.provider };
}

/** AI digest across all of a day's reports for management (not persisted). */
export async function teamDigest({ date: day } = {}) {
  const date = startOfDay(day || new Date());
  const reports = await DailyReport.find({ date }).populate({ path: 'user', select: 'name' });

  if (!reports.length) {
    return { digest: 'No reports were submitted for this date.', provider: 'none', reportCount: 0 };
  }

  const lines = reports.map((r) => {
    const work = String(r.workDone || '').replace(/\s+/g, ' ').slice(0, 200);
    const blockers = String(r.blockers || '').trim();
    return `- ${r.user?.name || 'Unknown'} (${r.hoursWorked}h): ${work}${blockers ? ` | BLOCKED: ${blockers}` : ''}`;
  });

  const ai = getAI();
  const result = await ai.complete({
    system:
      "You write an evening team digest for management: overall progress, who is blocked, " +
      "notable wins, and tomorrow's focus. Max 8 bullets.",
    messages: [
      { role: 'user', content: `Team daily reports for ${date.toDateString()}:\n${lines.join('\n')}` },
    ],
    maxTokens: 700,
  });

  return { digest: result.text, provider: result.provider, reportCount: reports.length };
}
