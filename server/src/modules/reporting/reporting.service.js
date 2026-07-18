import DailyReport from '../../models/dailyReport.model.js';
import User from '../../models/user.model.js';
import Role from '../../models/role.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { MODULES, ACTIONS, SYSTEM_ROLES } from '../../config/constants.js';
import { getAI } from '../../services/ai/index.js';
import { notify, notifyMany } from '../notifications/notifications.service.js';

const USER_POPULATE = {
  path: 'user',
  select: 'name email department designation company reportsTo',
  populate: { path: 'company', select: 'name code color' },
};
const REVIEW_POPULATE = [
  { path: 'managerReview.reviewer', select: 'name email' },
  { path: 'adminReview.reviewer', select: 'name email' },
];
const TASKS_POPULATE = { path: 'tasksWorked', select: 'title status' };
const DETAIL_POPULATE = [USER_POPULATE, ...REVIEW_POPULATE, TASKS_POPULATE];
const LIST_POPULATE = [USER_POPULATE, ...REVIEW_POPULATE];

const REPORT_LINK = '/reporting';

/** Normalize any date to local start of day so one report maps to one day. */
function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Ids of every active admin/super-admin — the top of the approval chain. */
async function getAdminUserIds() {
  const roleIds = await Role.find({
    slug: { $in: [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMIN] },
  }).distinct('_id');
  return User.find({ roles: { $in: roleIds }, isActive: true }).distinct('_id');
}

/** Is this actor an admin (super admin or the admin role)? */
async function actorIsAdmin(user, { isSuperAdmin } = {}) {
  if (isSuperAdmin) return true;
  const populated = user.roles?.[0]?.slug
    ? user
    : await User.findById(user._id).populate({ path: 'roles', select: 'slug isSuperAdmin' });
  return (populated.roles || []).some(
    (r) => r.slug === SYSTEM_ROLES.ADMIN || r.slug === SYSTEM_ROLES.SUPER_ADMIN || r.isSuperAdmin
  );
}

/** Owner, the author's manager, or an admin/analytics reader may view a report. */
function assertCanView(report, user, { permissions, isSuperAdmin } = {}) {
  if (isSuperAdmin) return;
  const ownerId = String(report.user?._id ?? report.user);
  if (ownerId === String(user._id)) return;
  // The author's direct manager may always view.
  const managerId = report.user?.reportsTo && String(report.user.reportsTo);
  if (managerId && managerId === String(user._id)) return;
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
  'meetings', 'gitCommits', 'tasksWorked', 'remarks', 'mood', 'attachments',
];

/**
 * Upsert the caller's report for the given day (defaults to today) and route it
 * into review. A brand-new or re-submitted report enters `submitted` and clears
 * any prior decisions, then notifies the author's manager (or the admins, if the
 * author has no manager) that a report is waiting for review.
 */
export async function submitReport(data, user) {
  const date = startOfDay(data.date || new Date());

  let report = await DailyReport.findOne({ user: user._id, date });
  const created = !report;
  if (!report) report = new DailyReport({ user: user._id, date });

  for (const f of SUBMITTABLE) if (data[f] !== undefined) report[f] = data[f];

  // (Re)entering the review pipeline resets the approval state.
  report.status = 'submitted';
  report.managerReview = null;
  report.adminReview = null;
  await report.save();

  await notifyReviewers(report, user);

  return { report, created };
}

/** Notify whoever must review a freshly-submitted report. */
async function notifyReviewers(report, author) {
  const authorDoc = await User.findById(author._id).select('name reportsTo');
  const recipients = authorDoc?.reportsTo
    ? [authorDoc.reportsTo]
    : await getAdminUserIds(); // no manager → straight to admins
  await notifyMany(recipients, {
    actor: author._id,
    type: 'report_submitted',
    message: `${authorDoc?.name || 'An employee'} submitted an evening report for your review`,
    entityType: 'dailyReport',
    entityId: report._id,
    link: REPORT_LINK,
  });
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
    DailyReport.find(filter).populate(REVIEW_POPULATE).sort(effectiveSort).skip(skip).limit(limit),
    DailyReport.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

/**
 * Reports for one day, scoped to the caller's place in the org chart:
 *   - admin  → every report (top of the chain).
 *   - manager → only their direct reports' reports.
 * Returns { date, reports, scope } sorted by author name.
 */
export async function getTeamReports(query = {}, user, ctx = {}) {
  const date = startOfDay(query.date || new Date());
  const isAdmin = await actorIsAdmin(user, ctx);

  const filter = { date };
  if (!isAdmin) {
    const reportIds = await User.find({ reportsTo: user._id }).distinct('_id');
    filter.user = { $in: reportIds };
  }

  const reports = await DailyReport.find(filter).populate(LIST_POPULATE);
  reports.sort((a, b) => (a.user?.name || '').localeCompare(b.user?.name || ''));
  return { date, reports, scope: isAdmin ? 'admin' : 'manager' };
}

export async function getReport(id, user, ctx = {}) {
  const report = await DailyReport.findById(id).populate(DETAIL_POPULATE);
  if (!report) throw ApiError.notFound('Report not found');
  assertCanView(report, user, ctx);
  return report;
}

/**
 * Approve or reject a report, enforcing the org-chart review chain and firing
 * the right notifications. `decision` is 'approved' | 'rejected'; a rejection
 * carries a `reason`. Returns the freshly-populated report.
 */
export async function decideReport(id, { decision, reason }, actor, ctx = {}) {
  const report = await DailyReport.findById(id).populate({
    path: 'user',
    select: 'name reportsTo',
  });
  if (!report) throw ApiError.notFound('Report not found');

  const author = report.user;
  const authorId = String(author?._id ?? author);
  if (authorId === String(actor._id)) {
    throw ApiError.badRequest('You cannot review your own report');
  }

  const isAdmin = await actorIsAdmin(actor, ctx);
  const isManagerOfAuthor =
    author?.reportsTo && String(author.reportsTo) === String(actor._id);

  // Which review level is this actor performing, given the current status?
  let level = null;
  if (report.status === 'submitted') {
    if (isManagerOfAuthor) level = 'manager';
    else if (isAdmin) level = 'admin'; // author has no manager, or admin override
  } else if (report.status === 'manager_approved') {
    if (isAdmin) level = 'admin';
  } else if (report.status === 'admin_rejected') {
    // Admin bounced it back to the manager, who relays it to the employee
    // (reject → back to employee) or fixes and re-escalates (approve → admin).
    if (isManagerOfAuthor) level = 'manager';
    else if (isAdmin) level = 'admin';
  }

  if (!level) {
    throw ApiError.forbidden(
      'This report is not awaiting your review',
      { code: 'NOT_REPORT_REVIEWER' }
    );
  }

  const stamp = { reviewer: actor._id, decision, reason: reason || '', at: new Date() };

  if (level === 'manager') {
    report.managerReview = stamp;
    report.status = decision === 'approved' ? 'manager_approved' : 'manager_rejected';
  } else {
    report.adminReview = stamp;
    report.status = decision === 'approved' ? 'admin_approved' : 'admin_rejected';
  }
  await report.save();

  await notifyDecision(report, author, actor, level, decision, reason);

  return DailyReport.findById(report._id).populate(LIST_POPULATE);
}

/** Fan out notifications for an approval decision, up and down the chain. */
async function notifyDecision(report, author, actor, level, decision, reason) {
  const authorId = author?._id ?? author;
  const base = {
    actor: actor._id,
    entityType: 'dailyReport',
    entityId: report._id,
    link: REPORT_LINK,
  };

  if (level === 'manager' && decision === 'approved') {
    // Up to admins for final review; let the author know it advanced.
    const admins = await getAdminUserIds();
    await notifyMany(admins, {
      ...base,
      type: 'report_submitted',
      message: `${actor.name} accepted ${author?.name || 'an employee'}'s report — awaiting your review`,
    });
    await notify(authorId, {
      ...base,
      type: 'report_approved',
      message: `${actor.name} accepted your evening report and sent it to admin`,
    });
  } else if (level === 'manager' && decision === 'rejected') {
    await notify(authorId, {
      ...base,
      type: 'report_rejected',
      message: `${actor.name} returned your report: ${reason}`,
    });
  } else if (level === 'admin' && decision === 'approved') {
    // Final acceptance — tell the author and their manager.
    const recipients = [authorId];
    if (author?.reportsTo) recipients.push(author.reportsTo);
    await notifyMany(recipients, {
      ...base,
      type: 'report_approved',
      message: `${actor.name} gave final acceptance to ${author?.name || 'the'} evening report`,
    });
  } else if (level === 'admin' && decision === 'rejected') {
    // Back down to the manager who approved it (fall back to the author).
    const recipient = report.managerReview?.reviewer || author?.reportsTo || authorId;
    await notify(recipient, {
      ...base,
      type: 'report_rejected',
      message: `${actor.name} returned ${author?.name || 'the'} report: ${reason}`,
    });
  }
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
