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
import IntegrationState from '../../models/integrationState.model.js';
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

/**
 * HRMS deleted the employee — remove the DDD mirror row entirely so the
 * directory matches HRMS (no lingering "Disabled" ghost). Scoped to
 * source:'hrms' so owner/manually-created accounts are never touched. Note an
 * HRMS *status* of Exited is NOT a deletion — that arrives via employee.updated
 * and keeps the row (shown as "Exited"); only a real delete removes it.
 */
export async function removeEmployee(emp) {
  if (!emp?.empId) return null;
  const res = await User.deleteOne({ hrmsId: emp.empId, source: 'hrms' });
  return res.deletedCount > 0 ? { empId: emp.empId, deleted: true } : null;
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

const money = (v) => Math.max(0, Number(v) || 0);

/**
 * {month,status,paidOn,paidEmps,aggregates:{totalCost,headcount,byDepartment},
 * rows:[{empId,name,dept,role,join,gross,basic,hra,special,pf,pt,tds,ded,net,paid}]}
 * → PayrollPeriod upsert on {month, ITSYBIZZ company} with the FULL
 * per-employee salary breakup mirrored into `entries`. Optional `expenses`
 * (that month's HRMS reimbursement claims, bootstrap only) land in
 * `reimbursements` + the pending roll-up numbers.
 */
export async function upsertPayroll(p, { expenses } = {}) {
  if (!p?.month) return null;
  const company = await getItsybizzCompanyId();
  const createdBy = await getSystemUserId();
  if (!createdBy) return null; // cannot satisfy required createdBy — no users yet
  const agg = p.aggregates || {};

  const set = {
    status: PAYROLL_STATUS_MAP[p.status] || 'draft',
    currency: 'INR',
    paidOn: p.paidOn || '',
    totalCost: money(agg.totalCost),
    headcount: money(agg.headcount),
    byDepartment: Array.isArray(agg.byDepartment)
      ? agg.byDepartment.map((d) => ({
          department: d.department || '',
          headcount: money(d.headcount),
          cost: money(d.cost),
        }))
      : [],
    source: 'hrms',
    externalId: `HRMSPAY-${p.month}`,
  };

  // Per-employee salary breakup. Only replace when the payload carries rows —
  // an old-shape event without them leaves the stored detail untouched.
  if (Array.isArray(p.rows)) {
    // Resolve every row's DDD user in ONE query (was a findOne per row — a
    // costly N+1 during bootstrap sync).
    const empIds = p.rows.map((r) => r?.empId).filter(Boolean);
    const users = empIds.length
      ? await User.find({ hrmsId: { $in: empIds } }).select('_id hrmsId').lean()
      : [];
    const userByEmp = new Map(users.map((u) => [u.hrmsId, u._id]));
    set.entries = p.rows.map((row) => ({
      user: userByEmp.get(row.empId) ?? null,
      empId: row.empId || '',
      name: row.name || '',
      department: row.dept || '',
      designation: row.role || '',
      joinDate: row.join || '',
      gross: money(row.gross),
      basic: money(row.basic),
      hra: money(row.hra),
      special: money(row.special),
      pf: money(row.pf),
      pt: money(row.pt),
      tds: money(row.tds),
      deductions: money(row.ded),
      net: money(row.net),
      paid: Boolean(row.paid),
    }));
  }

  // This month's reimbursement claims (HRMS expense module).
  if (Array.isArray(expenses)) {
    set.reimbursements = expenses.map((e) => ({
      code: e.code || '',
      empId: e.emp || '',
      title: e.title || '',
      category: e.cat || '',
      amount: money(e.amt),
      date: e.date || '',
      status: e.status || '',
      decidedBy: e.decidedBy || '',
    }));
    const pending = expenses.filter((e) => e.status === 'Pending');
    set.reimbursementsPending = pending.length;
    set.reimbursementsAmount = pending.reduce((sum, e) => sum + money(e.amt), 0);
  }

  await PayrollPeriod.updateOne(
    { month: p.month, company },
    { $set: set, $setOnInsert: { createdBy } },
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
  'employee.deleted': [removeEmployee, 'users:changed', 'employee_analytics:changed'],
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

// In-memory cache over the durable IntegrationState row ('hrms') so the
// "last synced" label survives server restarts.
let lastSyncAt = null;
let lastSyncLoaded = false;

async function loadLastSyncAt() {
  if (!lastSyncLoaded) {
    const row = await IntegrationState.findOne({ key: 'hrms' }).lean();
    lastSyncAt = row?.lastSyncAt ?? null;
    lastSyncLoaded = true;
  }
  return lastSyncAt;
}

async function saveLastSyncAt(when) {
  lastSyncAt = when;
  lastSyncLoaded = true;
  await IntegrationState.updateOne(
    { key: 'hrms' },
    { $set: { lastSyncAt: when } },
    { upsert: true }
  );
}

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
  // Items WITHIN each entity type are independent, so each type is processed as
  // one parallel batch (was ~200 sequential Atlas round-trips → ~8s). Type
  // ORDER is preserved: employees first (users must exist before attendance/
  // leaves/payroll resolve them), and openings before candidates (candidates
  // resolve their position by title).
  const countAll = (key, results) => {
    for (const r of results) if (r) counts[key] += 1;
  };

  // 1) Employees — two passes so managerId → reportsTo resolves in any order.
  countAll('employees', await Promise.all((snap.employees || []).map((emp) => upsertEmployee(emp))));
  await Promise.all((snap.employees || []).filter((e) => e?.managerId).map((emp) => upsertEmployee(emp)));

  // 2) Attendance & 3) Leaves — independent of each other, run concurrently.
  const [attRes, leaveRes] = await Promise.all([
    Promise.all((snap.attendance || []).map((rec) => upsertAttendance(rec))),
    Promise.all((snap.leaves || []).map((leave) => upsertLeave(leave))),
  ]);
  countAll('attendance', attRes);
  countAll('leaves', leaveRes);

  // 4) Payroll — reimbursement claims fold into their month ('YYYY-MM-DD' → 'YYYY-MM').
  const expensesByMonth = new Map();
  for (const ex of snap.expenses || []) {
    const month = String(ex?.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (!expensesByMonth.has(month)) expensesByMonth.set(month, []);
    expensesByMonth.get(month).push(ex);
  }
  countAll('payroll', await Promise.all((snap.payroll || []).map((run) =>
    upsertPayroll(run, { expenses: expensesByMonth.get(run.month) || [] }))));

  // 5) Openings BEFORE 6) candidates (candidates resolve positions by title).
  countAll('openings', await Promise.all((snap.openings || []).map((o) => upsertOpening(o))));
  countAll('candidates', await Promise.all((snap.candidates || []).map((c) => upsertCandidate(c))));

  // 7) Evening reports — silent catch-up, except a brand-new report for today
  //    (submitted while DDD was down) still notifies its reviewers.
  const today = startOfDay(new Date());
  countAll('reports', await Promise.all((snap.eveningReports || []).map(async (report) => {
    const isToday = startOfDay(toLocalDate(report?.date) || 0).getTime() === today.getTime();
    const existed = report?.code
      ? Boolean(await DailyReport.exists({ externalId: report.code }))
      : true;
    return upsertEveningReport(report, { notify: isToday && !existed });
  })));

  // 8) Reconcile deletions. The employees/leaves/openings/candidates lists are
  //    COMPLETE (the HRMS bootstrap sends every non-deleted row), so a mirror
  //    row missing from the snapshot was deleted in the HRMS. Without this
  //    pass, HRMS deletions never disappear from DDD (live *.deleted events
  //    only reach whichever DDD the HRMS's DDD_API_URL points at). Attendance
  //    (60-day window) and evening reports (30-day window) are windowed
  //    snapshots and are never reconciled.
  const removed = { employees: 0, leaves: 0, openings: 0, candidates: 0 };

  // Independent collections — reconcile all four concurrently. Each is guarded
  // on Array.isArray so a missing list is skipped (employees also on non-empty,
  // so a malformed snapshot can never wipe the whole directory).
  const liveOf = (list, key) => (list || []).map((x) => x?.[key]).filter(Boolean);
  await Promise.all([
    (async () => {
      if (!Array.isArray(snap.employees) || !snap.employees.length) return;
      // Hard-delete every HRMS mirror absent from the snapshot (deleted in HRMS)
      // — also purges legacy soft-deactivated "Disabled" ghosts. Exited-status
      // employees stay (still in the snapshot).
      const res = await User.deleteMany({ source: 'hrms', hrmsId: { $nin: liveOf(snap.employees, 'empId') } });
      removed.employees = res.deletedCount;
    })(),
    (async () => {
      if (!Array.isArray(snap.leaves)) return;
      removed.leaves = (await LeaveRequest.deleteMany({
        source: 'hrms',
        externalId: { $exists: true, $ne: null, $nin: liveOf(snap.leaves, 'code') },
      })).deletedCount;
    })(),
    (async () => {
      if (!Array.isArray(snap.openings)) return;
      // Placeholder positions resolved from candidate titles carry no externalId — untouched.
      removed.openings = (await JobPosition.updateMany(
        { source: 'hrms', externalId: { $exists: true, $ne: null, $nin: liveOf(snap.openings, 'code') }, status: { $ne: 'closed' } },
        { $set: { status: 'closed' } }
      )).modifiedCount;
    })(),
    (async () => {
      if (!Array.isArray(snap.candidates)) return;
      removed.candidates = (await Candidate.deleteMany({
        sourceSystem: 'hrms',
        externalId: { $exists: true, $ne: null, $nin: liveOf(snap.candidates, 'code') },
      })).deletedCount;
    })(),
  ]);

  await saveLastSyncAt(new Date());

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

  logger.info(
    `HRMS bootstrap sync complete: ${JSON.stringify(counts)} removed=${JSON.stringify(removed)}`
  );
  return { status: 'synced', lastSyncAt, ...counts, removed };
}

/* ============================== Status ================================ */

/** Integration status for the owner console + HRMS-side monitoring. */
export async function getStatus() {
  const [hrmsReachable, users, attendance, leaves, payroll, openings, candidates, reports] =
    await Promise.all([
      hrmsClient.pingHrms(),
      // Active mirrors only — deactivated (HRMS-deleted) employees don't count.
      User.countDocuments({ source: 'hrms', isActive: true }),
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
    lastSyncAt: await loadLastSyncAt(),
    counts: { employees: users, attendance, leaves, payroll, openings, candidates, reports },
  };
}
