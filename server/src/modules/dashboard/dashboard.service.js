/**
 * Dashboard (Module 10) — read-only, cross-module aggregator.
 *
 * Architecture rule: this module may import other modules' MODELS directly
 * (models are the data contract) but must never import their services or
 * controllers. Every query here is a read-only count / aggregate / find.
 *
 * The overview is permission-aware: a section is included only when the user
 * can read the module that owns the underlying data; all sections the user
 * can see are computed in parallel.
 */
import Task, { TASK_STATUSES } from '../../models/task.model.js';
import Goal from '../../models/goal.model.js';
import Project from '../../models/project.model.js';
import Renewal from '../../models/renewal.model.js';
import SupportTicket from '../../models/supportTicket.model.js';
import Transaction from '../../models/transaction.model.js';
import Asset from '../../models/asset.model.js';
import MaintenanceRecord from '../../models/maintenanceRecord.model.js';
import DailyReport from '../../models/dailyReport.model.js';
import EmployeeRecord from '../../models/employeeRecord.model.js';
import LeaveRequest from '../../models/leaveRequest.model.js';
import JobPosition from '../../models/jobPosition.model.js';
import Candidate from '../../models/candidate.model.js';
import PayrollPeriod from '../../models/payrollPeriod.model.js';
import HrDocument from '../../models/hrDocument.model.js';
import User from '../../models/user.model.js';
import { MODULES } from '../../config/constants.js';

// Status sets mirrored from the owning models' enums.
const GOAL_ACTIVE_STATUSES = Object.freeze(['in_progress', 'on_track', 'at_risk']);
const RENEWAL_OPEN_STATUSES = Object.freeze(['upcoming', 'due']);
const TICKET_OPEN_STATUSES = Object.freeze(['open', 'in_progress', 'waiting']);
const MAINTENANCE_UPCOMING_STATUSES = Object.freeze(['scheduled', 'in_progress']);
const PRESENT_ATTENDANCE_STATUSES = Object.freeze(['present', 'wfh']);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Aggregated, permission-aware business overview for the dashboard.
 * Sections the user cannot read are simply omitted from the result.
 */
export async function getOverview(user, permissions, isSuperAdmin) {
  const perms = permissions || new Set();
  const can = (module) =>
    isSuperAdmin || perms.has(`${module}:read`) || perms.has(`${module}:manage`);

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + DAY_MS); // start of tomorrow
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const in30Days = new Date(now.getTime() + 30 * DAY_MS);

  const overview = { generatedAt: new Date() };
  const jobs = [];
  // Kick every permitted section off immediately so they all run in parallel.
  const add = (key, build) =>
    jobs.push(
      build().then((section) => {
        overview[key] = section;
      })
    );

  if (can(MODULES.TASKS)) {
    add('tasks', async () => {
      const TASK_CARD = 'title status priority dueDate assignees assignedBy createdBy company delegationChain';
      const CARD_POPULATE = [
        { path: 'assignees', select: 'name avatar designation' },
        { path: 'assignedBy', select: 'name avatar' },
        { path: 'createdBy', select: 'name avatar' },
        { path: 'company', select: 'name code color' },
      ];

      const [statusRows, overdue, dueToday, myOpen, assignedToMe] = await Promise.all([
        Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Task.countDocuments({ dueDate: { $lt: now }, status: { $ne: 'done' } }),
        Task.countDocuments({ dueDate: { $gte: todayStart, $lt: todayEnd } }),
        Task.countDocuments({ assignees: user._id, status: { $ne: 'done' } }),
        // Full-detail list of my open tasks (who assigned them, priority, due).
        Task.find({ assignees: user._id, status: { $ne: 'done' } })
          .select(TASK_CARD)
          .populate(CARD_POPULATE)
          .sort({ priority: -1, dueDate: 1 })
          .limit(8),
      ]);
      const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0]));
      for (const row of statusRows) {
        if (byStatus[row._id] !== undefined) byStatus[row._id] = row.count;
      }

      const section = { byStatus, overdue, dueToday, myOpen, assignedToMe };

      // Manager view: my direct reports' open tasks + tasks I delegated onward.
      const reports = await User.find({ reportsTo: user._id, isActive: true }).select('_id name');
      if (reports.length) {
        const reportIds = reports.map((r) => r._id);
        const [teamOpen, teamTasks, delegatedByMe] = await Promise.all([
          Task.countDocuments({ assignees: { $in: reportIds }, status: { $ne: 'done' } }),
          Task.find({ assignees: { $in: reportIds }, status: { $ne: 'done' } })
            .select(TASK_CARD)
            .populate(CARD_POPULATE)
            .sort({ priority: -1, dueDate: 1 })
            .limit(8),
          Task.find({ 'delegationChain.from': user._id, assignees: { $ne: user._id }, status: { $ne: 'done' } })
            .select(TASK_CARD)
            .populate(CARD_POPULATE)
            .sort({ updatedAt: -1 })
            .limit(8),
        ]);
        section.team = {
          size: reports.length,
          members: reports.map((r) => ({ _id: r._id, name: r.name })),
          open: teamOpen,
          tasks: teamTasks,
          delegatedByMe,
        };
      }

      return section;
    });
  }

  if (can(MODULES.GOALS)) {
    add('goals', async () => {
      const [active, atRisk, achievedThisMonth] = await Promise.all([
        Goal.countDocuments({ status: { $in: GOAL_ACTIVE_STATUSES } }),
        Goal.countDocuments({ status: 'at_risk' }),
        Goal.countDocuments({ achievedAt: { $gte: monthStart } }),
      ]);
      return { active, atRisk, achievedThisMonth };
    });
  }

  if (can(MODULES.RRRMAS)) {
    add('projects', async () => {
      const [active, topActive] = await Promise.all([
        Project.countDocuments({ status: 'active' }),
        Project.find({ status: 'active' })
          .sort({ progress: -1 })
          .limit(5)
          .select('name progress')
          .lean(),
      ]);
      return { active, topActive };
    });

    add('renewals', async () => {
      const dueSoonFilter = {
        status: { $in: RENEWAL_OPEN_STATUSES },
        dueDate: { $gte: now, $lte: in30Days },
      };
      const [dueIn30, amountRows, next] = await Promise.all([
        Renewal.countDocuments(dueSoonFilter),
        Renewal.aggregate([
          { $match: dueSoonFilter },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Renewal.find({ status: { $in: RENEWAL_OPEN_STATUSES }, dueDate: { $gte: now } })
          .sort({ dueDate: 1 })
          .limit(5)
          .select('title dueDate amount')
          .lean(),
      ]);
      return { dueIn30, amountDueIn30: amountRows[0]?.total || 0, next };
    });

    add('support', async () => {
      const [open, breached] = await Promise.all([
        SupportTicket.countDocuments({ status: { $in: TICKET_OPEN_STATUSES } }),
        SupportTicket.countDocuments({
          status: { $in: TICKET_OPEN_STATUSES },
          'sla.dueAt': { $lt: now },
        }),
      ]);
      return { open, breached };
    });
  }

  if (can(MODULES.FINANCE)) {
    add('finance', async () => {
      const rows = await Transaction.aggregate([
        { $match: { date: { $gte: monthStart } } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]);
      const totals = Object.fromEntries(rows.map((r) => [r._id, r.total]));
      const monthIncome = totals.income || 0;
      const monthExpense = totals.expense || 0;
      return { monthIncome, monthExpense, monthNet: monthIncome - monthExpense };
    });
  }

  if (can(MODULES.MAINTENANCE)) {
    add('maintenance', async () => {
      const [upcomingIn30, breakdownAssets] = await Promise.all([
        MaintenanceRecord.countDocuments({
          status: { $in: MAINTENANCE_UPCOMING_STATUSES },
          scheduledFor: { $gte: now, $lte: in30Days },
        }),
        Asset.countDocuments({ status: 'breakdown' }),
      ]);
      return { upcomingIn30, breakdownAssets };
    });
  }

  // Reporting: the user's own submission flag only needs evening_reporting
  // read; the org-wide "submitted today" count additionally requires
  // employee_analytics read (it reveals other employees' activity).
  if (can(MODULES.EVENING_REPORTING)) {
    add('reporting', async () => {
      const todayFilter = { date: { $gte: todayStart, $lt: todayEnd } };
      const [mine, submittedToday] = await Promise.all([
        DailyReport.exists({ ...todayFilter, user: user._id }),
        can(MODULES.EMPLOYEE_ANALYTICS) ? DailyReport.countDocuments(todayFilter) : null,
      ]);
      return { myReportSubmittedToday: Boolean(mine), submittedToday };
    });
  }

  if (can(MODULES.EMPLOYEE_ANALYTICS)) {
    add('employees', async () => {
      const [presentToday, headcount, joinersThisMonth, exitsThisMonth, onLeaveToday, docsExpiringSoon, probationsDue] =
        await Promise.all([
          EmployeeRecord.countDocuments({
            date: { $gte: todayStart, $lt: todayEnd },
            attendance: { $in: PRESENT_ATTENDANCE_STATUSES },
          }),
          User.countDocuments({ isActive: true, employmentStatus: { $ne: 'exited' } }),
          User.countDocuments({ dateOfJoining: { $gte: monthStart } }),
          User.countDocuments({ dateOfExit: { $gte: monthStart } }),
          EmployeeRecord.countDocuments({ date: { $gte: todayStart, $lt: todayEnd }, attendance: 'leave' }),
          HrDocument.countDocuments({ expiresOn: { $gte: now, $lte: in30Days } }),
          User.countDocuments({ probationEndDate: { $gte: now, $lte: in30Days } }),
        ]);
      return { presentToday, headcount, joinersThisMonth, exitsThisMonth, onLeaveToday, docsExpiringSoon, probationsDue };
    });
  }

  if (can(MODULES.LEAVE)) {
    add('leave', async () => {
      const weekEnd = new Date(now.getTime() + 7 * DAY_MS);
      const [onLeaveToday, pendingApprovals, upcomingThisWeek] = await Promise.all([
        LeaveRequest.countDocuments({ status: 'approved', fromDate: { $lt: todayEnd }, toDate: { $gte: todayStart } }),
        LeaveRequest.countDocuments({ status: 'pending' }),
        LeaveRequest.countDocuments({ status: 'approved', fromDate: { $gte: now, $lte: weekEnd } }),
      ]);
      return { onLeaveToday, pendingApprovals, upcomingThisWeek };
    });
  }

  if (can(MODULES.RECRUITMENT)) {
    add('recruitment', async () => {
      const [openPositions, openingsRows, offersPending, funnelRows] = await Promise.all([
        JobPosition.countDocuments({ status: 'open' }),
        JobPosition.aggregate([{ $match: { status: 'open' } }, { $group: { _id: null, total: { $sum: '$openings' } } }]),
        Candidate.countDocuments({ stage: 'offer' }),
        Candidate.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
      ]);
      const funnel = Object.fromEntries(funnelRows.map((r) => [r._id, r.count]));
      return { openPositions, totalOpenings: openingsRows[0]?.total || 0, offersPending, funnel };
    });
  }

  if (can(MODULES.PAYROLL)) {
    add('payroll', async () => {
      const latestMonth = await PayrollPeriod.findOne().sort({ month: -1 }).select('month').lean();
      if (!latestMonth) return { month: null, totalCost: 0, headcount: 0, reimbursementsPending: 0 };
      const rows = await PayrollPeriod.aggregate([
        { $match: { month: latestMonth.month } },
        {
          $group: {
            _id: null,
            totalCost: { $sum: '$totalCost' },
            headcount: { $sum: '$headcount' },
            reimbursementsPending: { $sum: '$reimbursementsPending' },
          },
        },
      ]);
      const agg = rows[0] || {};
      return {
        month: latestMonth.month,
        totalCost: agg.totalCost || 0,
        headcount: agg.headcount || 0,
        reimbursementsPending: agg.reimbursementsPending || 0,
      };
    });
  }

  await Promise.all(jobs);
  return overview;
}
