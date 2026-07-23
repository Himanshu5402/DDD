/**
 * HRMS → DDD mirror sync (inbound half of the two-way integration).
 *
 * Two entry points, both built on the same idempotent upsert functions:
 *  - handleEvent(event, payload) — real-time pushes from the HRMS
 *    (POST /integrations/hrms/events). Events may arrive twice (echoes after
 *    write-through) — every upsert converges, never duplicates.
 *  - runBootstrapSync() — full pull of GET {HRMS_API_URL}/integration/bootstrap,
 *    replayed through the upserts in dependency order (employees first).
 *
 * Cross-refs resolve via User.hrmsId (HRMS joins by empId STRING, DDD by
 * ObjectId). A missing manager/user simply resolves to null — a later re-run
 * of the same event or a bootstrap fixes the ordering.
 */
import crypto from 'node:crypto';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import User from '../../models/user.model.js';
import Company from '../../models/company.model.js';
import EmployeeRecord from '../../models/employeeRecord.model.js';
import LeaveRequest from '../../models/leaveRequest.model.js';
import JobPosition from '../../models/jobPosition.model.js';
import Candidate from '../../models/candidate.model.js';
import PayrollPeriod from '../../models/payrollPeriod.model.js';
import DailyReport, { ATTACHMENT_TYPES } from '../../models/dailyReport.model.js';
import { broadcast } from '../../socket/index.js';
import * as hrmsClient from '../../services/integrations/hrms.client.js';
import { submitReport } from '../reporting/reporting.service.js';

/* ============================ Enum mappings =========================== */
// Single source of truth: INTEGRATION_CONTRACT.md.

const EMPLOYEE_STATUS_MAP = { Active: 'active', Inactive: 'suspended', Exited: 'exited' };
const ACCESS_MAP = {
  'HR Admin': 'hr_admin',
  'HR Representative': 'manager',
  'Finance Representative': 'manager',
  Employee: 'employee',
};
const ATTENDANCE_MAP = { P: 'present', A: 'absent', L: 'leave', W: 'week_off', H: 'holiday' };
const LEAVE_TYPE_MAP = { Casual: 'casual', Sick: 'sick', Earned: 'earned' };
const LEAVE_STATUS_MAP = { Pending: 'pending', Approved: 'approved', Rejected: 'rejected' };
const PAYROLL_STATUS_MAP = { Pending: 'draft', Processing: 'processing', Paid: 'paid' };
const OPENING_STATUS_MAP = { Open: 'open', Closed: 'closed' };
const CANDIDATE_STAGE_MAP = {
  Applied: 'applied',
  Screening: 'screening',
  Interview: 'interview',
  Offer: 'offer',
  Hired: 'hired',
  Rejected: 'rejected',
};

/* =============================== Helpers ============================== */

/** HRMS 'YYYY-MM-DD' → local Date (server runs Asia/Kolkata), null if absent/bad. */
function toLocalDate(ymd) {
  if (!ymd) return null;
  const d = ymd instanceof Date ? new Date(ymd) : new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 'HH:mm' on a given day → Date (local), null if absent/bad. */
function timeOn(day, hhmm) {
  if (!day || !hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  const d = new Date(day);
  d.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

let systemUserIdCache = null;
/**
 * The DDD user mirrored rows are attributed to (createdBy): the seed admin —
 * earliest active non-HRMS account. Cached for the process lifetime.
 */
async function getSystemUserId() {
  if (systemUserIdCache) return systemUserIdCache;
  const admin =
    (await User.findOne({ isActive: true, source: { $ne: 'hrms' } })
      .sort({ createdAt: 1 })
      .select('_id')) || (await User.findOne().sort({ createdAt: 1 }).select('_id'));
  systemUserIdCache = admin?._id ?? null;
  return systemUserIdCache;
}

let companyIdCache = null;
/** The ITSYBIZZ company mirrored HR rows attach to (payroll, openings). */
async function getItsybizzCompanyId() {
  if (companyIdCache) return companyIdCache;
  const company =
    (await Company.findOne({ code: 'ITSYBIZZ' })) ||
    (await Company.findOne({ code: 'IBZ' })) ||
    (await Company.findOne({ name: /itsybizz/i })) ||
    (await Company.findOne({ isActive: true }).sort({ createdAt: 1 }));
  companyIdCache = company?._id ?? null;
  return companyIdCache;
}

const findUserByEmpId = (empId) => (empId ? User.findOne({ hrmsId: empId }) : null);

/* ========================== Employee upserts ========================== */

/**
 * Upsert one HRMS employee into the DDD User mirror (keyed on hrmsId=empId,
 * converging with a pre-existing account by email). New users get a random
 * 48-hex password (bcrypt-hashed by the model hook) and can NEVER log into
 * DDD — employees log into the HRMS portal.
 */
export async function upsertEmployee(emp) {
  if (!emp?.empId) return null;

  let user = await User.findOne({ hrmsId: emp.empId });
  if (!user && emp.email) {
    user = await User.findOne({ email: String(emp.email).toLowerCase() });
  }
  if (!user) {
    user = new User({
      name: emp.name || emp.empId,
      email: emp.email ? String(emp.email).toLowerCase() : `${emp.empId.toLowerCase()}@hrms.local`,
      password: crypto.randomBytes(24).toString('hex'), // 48-hex, hashed on save
    });
  }

  if (emp.name) user.name = emp.name;
  if (emp.email) user.email = String(emp.email).toLowerCase();
  user.source = 'hrms';
  user.hrmsId = emp.empId;
  user.employeeCode = emp.empId;
  user.department = emp.dept ?? user.department ?? '';
  user.designation = emp.role ?? user.designation ?? '';
  user.phone = emp.phone ?? user.phone ?? '';
  user.dateOfJoining = toLocalDate(emp.join) ?? user.dateOfJoining;
  user.dateOfBirth = toLocalDate(emp.dob) ?? user.dateOfBirth;
  user.employmentStatus = EMPLOYEE_STATUS_MAP[emp.status] || user.employmentStatus || 'active';
  user.accessLevel = ACCESS_MAP[emp.access] || 'employee';
  user.isActive = emp.status !== 'Exited';
  if (!user.company) user.company = await getItsybizzCompanyId();
  // salary is deliberately NOT stored on the DDD User (aggregates only);
  // gender has no DDD field and is ignored.

  // Org chart: managerId (empId) → reportsTo (ObjectId). Null when the manager
  // has not synced yet — a re-run/bootstrap fixes the ordering.
  if ('managerId' in emp) {
    const manager = emp.managerId ? await findUserByEmpId(emp.managerId) : null;
    user.reportsTo = manager && String(manager._id) !== String(user._id) ? manager._id : null;
  }

  await user.save();
  return user;
}

/** HRMS soft-deleted the employee — deactivate the mirror (never hard-delete). */
export async function deactivateEmployee(emp) {
  if (!emp?.empId) return null;
  const user = await User.findOne({ hrmsId: emp.empId });
  if (!user) return null;
  user.isActive = false;
  user.employmentStatus = 'exited';
  user.dateOfExit = user.dateOfExit || new Date();
  await user.save();
  return user;
}

/* ========================== Attendance upsert ========================= */

/** {emp,date,st,in,out} → EmployeeRecord upsert on {user, date}. */
export async function upsertAttendance(rec) {
  if (!rec?.emp || !rec?.date) return null;
  const st = ATTENDANCE_MAP[rec.st];
  if (!st) return null; // '' = not marked → skip (delete nothing)

  const user = await findUserByEmpId(rec.emp);
  if (!user) return null;

  const date = startOfDay(toLocalDate(rec.date));
  const checkIn = timeOn(date, rec.in);
  const checkOut = timeOn(date, rec.out);
  let hoursWorked = 0;
  if (checkIn && checkOut && checkOut > checkIn) {
    hoursWorked = Math.min(24, Math.round(((checkOut - checkIn) / 3.6e6) * 100) / 100);
  }

  await EmployeeRecord.updateOne(
    { user: user._id, date },
    {
      $set: { attendance: st, checkIn, checkOut, hoursWorked, source: 'hrms' },
      $setOnInsert: { createdBy: (await getSystemUserId()) ?? user._id },
    },
    { upsert: true }
  );
  return { user: user._id, date };
}

/* ============================ Leave upserts =========================== */

/** Full HRMS leave doc → LeaveRequest upsert on externalId (LV-1044). */
export async function upsertLeave(doc) {
  if (!doc?.code) return null;
  const user = await findUserByEmpId(doc.emp);
  if (!user) return null;

  const approver = doc.approver ? await findUserByEmpId(doc.approver) : null;
  const fromDate = toLocalDate(doc.from);
  const toDate = toLocalDate(doc.to) || fromDate;
  if (!fromDate) return null;

  const set = {
    user: user._id,
    hrmsId: doc.emp,
    leaveType: LEAVE_TYPE_MAP[doc.type] || 'casual',
    fromDate,
    toDate,
    days: Math.max(0.5, Number(doc.days) || 1),
    status: LEAVE_STATUS_MAP[doc.status] || 'pending',
    approver: approver?._id ?? null,
    reason: doc.reason || '',
    source: 'hrms',
  };
  const applied = toLocalDate(doc.applied);
  if (applied) set.appliedAt = applied;

  await LeaveRequest.updateOne(
    { externalId: doc.code },
    { $set: set, $setOnInsert: { createdBy: (await getSystemUserId()) ?? user._id } },
    { upsert: true }
  );
  return { externalId: doc.code };
}

/** HRMS deleted the leave — drop the mirror row so lists stay true. */
export async function removeLeave(doc) {
  if (!doc?.code) return null;
  const res = await LeaveRequest.deleteOne({ externalId: doc.code, source: 'hrms' });
  return { externalId: doc.code, deleted: res.deletedCount > 0 };
}

/* ============================== Payroll =============================== */

/**
 * {month,status,paidOn,paidEmps,aggregates:{totalCost,headcount,byDepartment}}
 * → PayrollPeriod upsert on {month, ITSYBIZZ company}. Aggregates only —
 * individual salaries never land in DDD.
 */
export async function upsertPayroll(p) {
  if (!p?.month) return null;
  const company = await getItsybizzCompanyId();
  const createdBy = await getSystemUserId();
  if (!createdBy) return null; // cannot satisfy required createdBy — no users yet
  const agg = p.aggregates || {};

  await PayrollPeriod.updateOne(
    { month: p.month, company },
    {
      $set: {
        status: PAYROLL_STATUS_MAP[p.status] || 'draft',
        currency: 'INR',
        totalCost: Math.max(0, Number(agg.totalCost) || 0),
        headcount: Math.max(0, Number(agg.headcount) || 0),
        byDepartment: Array.isArray(agg.byDepartment)
          ? agg.byDepartment.map((d) => ({
              department: d.department || '',
              headcount: Math.max(0, Number(d.headcount) || 0),
              cost: Math.max(0, Number(d.cost) || 0),
            }))
          : [],
        source: 'hrms',
        externalId: `HRMSPAY-${p.month}`,
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  return { month: p.month };
}

/* ============================ Recruitment ============================= */

/** Full HRMS opening doc → JobPosition upsert on externalId (JOB-07). */
export async function upsertOpening(doc) {
  if (!doc?.code) return null;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null;

  const set = {
    title: doc.title || doc.code,
    department: doc.dept || '',
    company: await getItsybizzCompanyId(),
    openings: Math.max(0, Number(doc.positions) || 1),
    status: OPENING_STATUS_MAP[doc.status] || 'open',
    description: doc.exp ? `Experience: ${doc.exp}` : '',
    source: 'hrms',
  };
  const posted = toLocalDate(doc.posted);
  if (posted) set.openSince = posted;

  const position = await JobPosition.findOneAndUpdate(
    { externalId: doc.code },
    { $set: set, $setOnInsert: { createdBy } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return position;
}

/**
 * HRMS deleted the opening — close the mirror instead of deleting it so
 * candidates that reference it keep resolving.
 */
export async function closeOpening(doc) {
  if (!doc?.code) return null;
  const position = await JobPosition.findOneAndUpdate(
    { externalId: doc.code, source: 'hrms' },
    { $set: { status: 'closed' } },
    { new: true }
  );
  return position;
}

/**
 * HRMS candidates reference their opening by TITLE string. Resolve to the
 * mirrored JobPosition, creating a placeholder if the opening has not synced.
 */
async function resolvePositionByTitle(title) {
  if (!title) return null;
  const existing = await JobPosition.findOne({ source: 'hrms', title });
  if (existing) return existing;
  const createdBy = await getSystemUserId();
  if (!createdBy) return null;
  return JobPosition.findOneAndUpdate(
    { source: 'hrms', title },
    {
      $setOnInsert: {
        title,
        department: '',
        company: await getItsybizzCompanyId(),
        status: 'open',
        source: 'hrms',
        createdBy,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Full HRMS candidate doc → Candidate upsert on externalId (CND-31). */
export async function upsertCandidate(doc) {
  if (!doc?.code) return null;
  const position = await resolvePositionByTitle(doc.job);
  if (!position) return null;

  const stage = CANDIDATE_STAGE_MAP[doc.stage] || 'applied';
  let candidate = await Candidate.findOne({ externalId: doc.code });
  if (!candidate) {
    candidate = new Candidate({
      externalId: doc.code,
      createdBy: (await getSystemUserId()) ?? undefined,
      appliedAt: toLocalDate(doc.applied) || new Date(),
    });
  }

  if (candidate.stage !== stage) candidate.stageUpdatedAt = new Date();
  candidate.name = doc.name || candidate.name || doc.code;
  candidate.phone = doc.phone || candidate.phone || '';
  candidate.position = position._id;
  candidate.stage = stage;
  candidate.sourceSystem = 'hrms'; // NB: this model uses sourceSystem, not source
  const applied = toLocalDate(doc.applied);
  if (applied) candidate.appliedAt = applied;

  await candidate.save();
  return candidate;
}

/** HRMS deleted the candidate — drop the mirror row. */
export async function removeCandidate(doc) {
  if (!doc?.code) return null;
  const res = await Candidate.deleteOne({ externalId: doc.code, sourceSystem: 'hrms' });
  return { externalId: doc.code, deleted: res.deletedCount > 0 };
}

/**
 * DDD has no Offer model — an offer advances the mirrored candidate to the
 * 'offer' stage and appends an offer note.
 */
export async function applyOffer(doc) {
  if (!doc) return null;
  const ref = doc.candidate || '';
  const candidate =
    (ref && (await Candidate.findOne({ externalId: ref, sourceSystem: 'hrms' }))) ||
    (ref && (await Candidate.findOne({ name: ref, sourceSystem: 'hrms' }))) ||
    (doc.name && (await Candidate.findOne({ name: doc.name, sourceSystem: 'hrms' })));
  if (!candidate) return null;

  if (candidate.stage !== 'offer') {
    candidate.stage = 'offer';
    candidate.stageUpdatedAt = new Date();
  }
  const note = `Offer ${doc.code || ''}: CTC ${doc.ctc ?? 0}`.trim();
  if (!candidate.notes?.includes(note)) {
    candidate.notes = candidate.notes ? `${candidate.notes}\n${note}` : note;
  }
  await candidate.save();
  return candidate;
}

/* =========================== Evening reports ========================== */

/**
 * HRMS attachment wire shape {url,key,type,name,size,mimeType} → DailyReport
 * attachment subdocs. Defensive: rows without a url or with a type outside
 * image|video are dropped, and the array is capped at 10 (the reporting
 * validation's own limit). Returns null when the payload carries no
 * attachments array at all, so old-shape events leave the mirror untouched.
 */
function mapReportAttachments(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter((a) => a?.url && ATTACHMENT_TYPES.includes(a.type))
    .slice(0, 10)
    .map((a) => ({
      url: String(a.url),
      key: a.key ? String(a.key) : '',
      type: a.type,
      name: a.name ? String(a.name) : '',
      size: Math.max(0, Number(a.size) || 0),
      mimeType: a.mimeType ? String(a.mimeType) : '',
    }));
}

/**
 * HRMS EveningReport → DDD DailyReport mirror (externalId = ER code).
 *
 * With `notify` (the live report.submitted event) the upsert goes through the
 * reporting service's own submit path — same {user,date} upsert, review-state
 * reset and notifyReviewers() fan-out a DDD-native submit gets, so the owner
 * hears about it immediately. Without it (bootstrap catch-up) the mirror is
 * written silently and already-decided reports are never reset.
 */
export async function upsertEveningReport(doc, { notify = true } = {}) {
  if (!doc?.emp) return null;
  const user = await findUserByEmpId(doc.emp);
  if (!user) return null;

  const date = startOfDay(toLocalDate(doc.date) || new Date());
  const fields = {
    workDone: doc.work || '(no summary provided)',
    tomorrowPlan: doc.plan || '',
    blockers: doc.blockers || '',
    hoursWorked: Math.min(24, Math.max(0, Number(doc.hours) || 8)),
  };
  // Cloudinary photos/videos travel as absolute URLs — mirror them verbatim,
  // replacing the stored array wholesale (resubmit semantics, like HRMS).
  const attachments = mapReportAttachments(doc.attachments);
  if (attachments) fields.attachments = attachments;

  let report;
  if (notify) {
    // The real reporting pipeline: upsert + status reset + reviewer notification.
    ({ report } = await submitReport({ date, ...fields }, user));
  } else {
    report =
      (doc.code && (await DailyReport.findOne({ externalId: doc.code }))) ||
      (await DailyReport.findOne({ user: user._id, date }));
    if (!report) {
      report = new DailyReport({ user: user._id, date, ...fields });
    } else if (report.status === 'submitted') {
      Object.assign(report, fields); // still awaiting review — safe to refresh
    }
  }

  if (doc.code && report.externalId !== doc.code) report.externalId = doc.code;
  if (report.isNew || report.isModified()) await report.save();
  return report;
}

/* ============================ Event router ============================ */

// event → [handler, ...socket events the open DDD pages listen for]
// Employee changes touch both the User directory (UsersPage/OrgChartPage listen
// for 'users:changed') and analytics (EmployeeAnalyticsPage → 'employee_analytics:changed').
const EVENT_HANDLERS = {
  'employee.created': [upsertEmployee, 'users:changed', 'employee_analytics:changed'],
  'employee.updated': [upsertEmployee, 'users:changed', 'employee_analytics:changed'],
  'employee.status_changed': [upsertEmployee, 'users:changed', 'employee_analytics:changed'],
  'employee.deleted': [deactivateEmployee, 'users:changed', 'employee_analytics:changed'],
  'attendance.marked': [upsertAttendance, 'employee_analytics:changed'],
  'leave.created': [upsertLeave, 'leave:changed'],
  'leave.decided': [upsertLeave, 'leave:changed'],
  'leave.deleted': [removeLeave, 'leave:changed'],
  'payroll.changed': [upsertPayroll, 'payroll:changed'],
  'recruitment.opening.changed': [upsertOpening, 'recruitment:changed'],
  'recruitment.opening.deleted': [closeOpening, 'recruitment:changed'],
  'recruitment.candidate.changed': [upsertCandidate, 'recruitment:changed'],
  'recruitment.candidate.deleted': [removeCandidate, 'recruitment:changed'],
  'recruitment.offer.created': [applyOffer, 'recruitment:changed'],
  'report.submitted': [upsertEveningReport, 'reports:changed'],
};

/**
 * Route one pushed HRMS event to its idempotent upsert. Unknown events are
 * acknowledged as {ignored:true} (forward-compatible — never an error).
 */
export async function handleEvent(event, payload = {}) {
  const entry = EVENT_HANDLERS[event];
  if (!entry) return { ignored: true, event };

  const [handler, ...socketEvents] = entry;
  const result = await handler(payload);

  if (result) {
    // Nudge open DDD pages to refetch — same convention their sockets listen to.
    for (const socketEvent of socketEvents) {
      broadcast(socketEvent, { type: `hrms:${event}`, at: Date.now() });
    }
  }
  return { event, handled: Boolean(result) };
}

/* =========================== Bootstrap sync =========================== */

let lastSyncAt = null;

/**
 * Full mirror rebuild: pull GET {HRMS_API_URL}/integration/bootstrap and replay
 * it through the same upserts in dependency order — employees first (twice, so
 * reportsTo resolves regardless of manager ordering), then attendance, leaves,
 * payroll, openings, candidates and evening reports.
 */
export async function runBootstrapSync() {
  const body = await hrmsClient.get('/integration/bootstrap');
  const snap = body?.data ?? body ?? {};

  const counts = {
    employees: 0,
    attendance: 0,
    leaves: 0,
    payroll: 0,
    openings: 0,
    candidates: 0,
    reports: 0,
  };
  const count = (key, value) => {
    if (value) counts[key] += 1;
  };

  // 1) Employees — two passes so managerId → reportsTo resolves in any order.
  for (const emp of snap.employees || []) count('employees', await upsertEmployee(emp));
  for (const emp of snap.employees || []) {
    if (emp?.managerId) await upsertEmployee(emp);
  }

  // 2) Attendance → 3) Leaves → 4) Payroll → 5) Openings → 6) Candidates.
  for (const rec of snap.attendance || []) count('attendance', await upsertAttendance(rec));
  for (const leave of snap.leaves || []) count('leaves', await upsertLeave(leave));
  for (const run of snap.payroll || []) count('payroll', await upsertPayroll(run));
  for (const opening of snap.openings || []) count('openings', await upsertOpening(opening));
  for (const cand of snap.candidates || []) count('candidates', await upsertCandidate(cand));

  // 7) Evening reports — silent catch-up, except a brand-new report for today
  //    (submitted while DDD was down) still notifies its reviewers.
  const today = startOfDay(new Date());
  for (const report of snap.eveningReports || []) {
    const isToday = startOfDay(toLocalDate(report?.date) || 0).getTime() === today.getTime();
    const existed = report?.code
      ? Boolean(await DailyReport.exists({ externalId: report.code }))
      : true;
    count('reports', await upsertEveningReport(report, { notify: isToday && !existed }));
  }

  lastSyncAt = new Date();

  for (const evt of [
    'users:changed',
    'employee_analytics:changed',
    'leave:changed',
    'payroll:changed',
    'recruitment:changed',
    'reports:changed',
  ]) {
    broadcast(evt, { type: 'hrms:bootstrap-sync', at: Date.now() });
  }

  logger.info(`HRMS bootstrap sync complete: ${JSON.stringify(counts)}`);
  return { status: 'synced', lastSyncAt, ...counts };
}

/* ============================== Status ================================ */

/** Integration status for the owner console + HRMS-side monitoring. */
export async function getStatus() {
  const [hrmsReachable, users, attendance, leaves, payroll, openings, candidates, reports] =
    await Promise.all([
      hrmsClient.pingHrms(),
      User.countDocuments({ source: 'hrms' }),
      EmployeeRecord.countDocuments({ source: 'hrms' }),
      LeaveRequest.countDocuments({ source: 'hrms' }),
      PayrollPeriod.countDocuments({ source: 'hrms' }),
      JobPosition.countDocuments({ source: 'hrms' }),
      Candidate.countDocuments({ sourceSystem: 'hrms' }),
      DailyReport.countDocuments({ externalId: { $exists: true, $ne: null } }),
    ]);

  return {
    enabled: env.HRMS_SYNC_ENABLED && hrmsClient.isHrmsConfigured(),
    hrmsReachable,
    lastSyncAt,
    counts: { employees: users, attendance, leaves, payroll, openings, candidates, reports },
  };
}
