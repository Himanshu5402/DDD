import Task from '../../models/task.model.js';
import Goal from '../../models/goal.model.js';
import Project from '../../models/project.model.js';
import Renewal from '../../models/renewal.model.js';
import SupportTicket from '../../models/supportTicket.model.js';
import Transaction from '../../models/transaction.model.js';
import Asset from '../../models/asset.model.js';
import MaintenanceRecord from '../../models/maintenanceRecord.model.js';
import DailyReport from '../../models/dailyReport.model.js';
import Contact from '../../models/contact.model.js';
import Product from '../../models/product.model.js';
import { getAI } from '../../services/ai/index.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

/**
 * AI Intelligence Layer (Module 9) — cross-module insights.
 *
 * This service reads other modules' models directly (READ-ONLY; models are
 * the data contract) but never their services/controllers. Every section is
 * permission-gated: a user only ever sees data from modules they can read.
 */

const OPEN_TICKET_STATUSES = ['open', 'in_progress', 'waiting'];
const PENDING_RENEWAL_STATUSES = ['upcoming', 'due'];

/** `can(module)` — true when the user may read the given module. */
function makeCan(permissions, isSuperAdmin) {
  const perms = permissions || new Set();
  return (m) =>
    Boolean(isSuperAdmin) ||
    perms.has(`${m}:${ACTIONS.READ}`) ||
    perms.has(`${m}:${ACTIONS.MANAGE}`);
}

/** Normalize any date to local start of day. */
function startOfDay(value = new Date()) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Escape user input so it can be embedded in a RegExp safely. */
function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fmtDate(value) {
  if (!value) return 'no date';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'no date' : d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Daily brief
// ---------------------------------------------------------------------------

/**
 * Cross-module "chief of staff" brief: gathers today's signals from every
 * module the user can read, composes a compact plain-text snapshot and asks
 * the AI provider for priorities, risks and quick wins.
 *
 * Returns { brief, provider, snapshot }.
 */
export async function dailyBrief(user, permissions, isSuperAdmin) {
  const can = makeCan(permissions, isSuperAdmin);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const in14d = new Date(todayStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in30d = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [tasks, goals, renewals, tickets, finance, maintenance, reports] = await Promise.all([
    // Tasks — overdue + due today.
    can(MODULES.TASKS)
      ? (async () => {
          const overdueFilter = { status: { $ne: 'done' }, dueDate: { $lt: todayStart } };
          const [overdueCount, overdueDocs, dueTodayCount] = await Promise.all([
            Task.countDocuments(overdueFilter),
            Task.find(overdueFilter).sort({ dueDate: 1 }).limit(5).select('title').lean(),
            Task.countDocuments({ status: { $ne: 'done' }, dueDate: { $gte: todayStart, $lt: todayEnd } }),
          ]);
          return { overdueCount, overdueTitles: overdueDocs.map((t) => t.title), dueTodayCount };
        })()
      : null,

    // Goals — at risk.
    can(MODULES.GOALS)
      ? (async () => {
          const [atRiskCount, atRiskDocs] = await Promise.all([
            Goal.countDocuments({ status: 'at_risk' }),
            Goal.find({ status: 'at_risk' }).sort({ targetDate: 1 }).limit(5).select('title').lean(),
          ]);
          return { atRiskCount, atRiskTitles: atRiskDocs.map((g) => g.title) };
        })()
      : null,

    // Renewals — due within 30 days.
    can(MODULES.RRRMAS)
      ? (async () => {
          const filter = {
            status: { $in: PENDING_RENEWAL_STATUSES },
            dueDate: { $gte: todayStart, $lte: in30d },
          };
          const [count, amountAgg, topDocs] = await Promise.all([
            Renewal.countDocuments(filter),
            Renewal.aggregate([
              { $match: filter },
              { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } },
            ]),
            Renewal.find(filter).sort({ dueDate: 1 }).limit(3).select('title dueDate').lean(),
          ]);
          return {
            count,
            totalAmount: amountAgg[0]?.total || 0,
            top: topDocs.map((r) => ({ title: r.title, dueDate: r.dueDate })),
          };
        })()
      : null,

    // Support tickets — open + SLA breached.
    can(MODULES.RRRMAS)
      ? (async () => {
          const openFilter = { status: { $in: OPEN_TICKET_STATUSES } };
          const breachedFilter = { ...openFilter, 'sla.breached': true };
          const [openCount, breachedCount, breachedDocs] = await Promise.all([
            SupportTicket.countDocuments(openFilter),
            SupportTicket.countDocuments(breachedFilter),
            SupportTicket.find(breachedFilter).sort({ 'sla.dueAt': 1 }).limit(3).select('subject').lean(),
          ]);
          return { openCount, breachedCount, breachedSubjects: breachedDocs.map((t) => t.subject) };
        })()
      : null,

    // Finance — this month's income / expense / net.
    can(MODULES.FINANCE)
      ? (async () => {
          const agg = await Transaction.aggregate([
            { $match: { date: { $gte: monthStart, $lt: nextMonthStart } } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } },
          ]);
          const income = agg.find((g) => g._id === 'income')?.total || 0;
          const expense = agg.find((g) => g._id === 'expense')?.total || 0;
          return { income, expense, net: income - expense };
        })()
      : null,

    // Maintenance — upcoming services + assets down.
    can(MODULES.MAINTENANCE)
      ? (async () => {
          const [upcomingCount, breakdownCount, breakdownDocs] = await Promise.all([
            MaintenanceRecord.countDocuments({
              status: 'scheduled',
              scheduledFor: { $gte: todayStart, $lte: in14d },
            }),
            Asset.countDocuments({ status: 'breakdown' }),
            Asset.find({ status: 'breakdown' }).limit(5).select('name').lean(),
          ]);
          return { upcomingCount, breakdownCount, breakdownNames: breakdownDocs.map((a) => a.name) };
        })()
      : null,

    // Evening reporting — today's submissions + blockers.
    can(MODULES.EVENING_REPORTING)
      ? (async () => {
          const docs = await DailyReport.find({ date: { $gte: todayStart, $lt: todayEnd } })
            .select('blockers')
            .lean();
          const blockers = docs
            .map((r) => String(r.blockers || '').trim())
            .filter(Boolean)
            .slice(0, 5);
          return { count: docs.length, blockers };
        })()
      : null,
  ]);

  // Compose a compact, labeled snapshot; skip sections with nothing to say.
  const lines = [`Business snapshot for ${now.toDateString()}:`];

  if (tasks && (tasks.overdueCount || tasks.dueTodayCount)) {
    const titles = tasks.overdueTitles.length ? ` Overdue: ${tasks.overdueTitles.join('; ')}.` : '';
    lines.push(`Tasks: ${tasks.overdueCount} overdue, ${tasks.dueTodayCount} due today.${titles}`);
  }
  if (goals && goals.atRiskCount) {
    lines.push(`Goals at risk: ${goals.atRiskCount} (${goals.atRiskTitles.join('; ')}).`);
  }
  if (renewals && renewals.count) {
    const top = renewals.top.map((r) => `${r.title} (${fmtDate(r.dueDate)})`).join('; ');
    lines.push(`Renewals due in 30 days: ${renewals.count} totaling ${renewals.totalAmount}. Next: ${top}.`);
  }
  if (tickets && (tickets.openCount || tickets.breachedCount)) {
    const subjects = tickets.breachedSubjects.length ? ` Breached: ${tickets.breachedSubjects.join('; ')}.` : '';
    lines.push(`Support tickets: ${tickets.openCount} open, ${tickets.breachedCount} SLA-breached.${subjects}`);
  }
  if (finance && (finance.income || finance.expense)) {
    lines.push(`Finance this month: income ${finance.income}, expense ${finance.expense}, net ${finance.net}.`);
  }
  if (maintenance && (maintenance.upcomingCount || maintenance.breakdownCount)) {
    const names = maintenance.breakdownNames.length ? ` (${maintenance.breakdownNames.join('; ')})` : '';
    lines.push(
      `Maintenance: ${maintenance.upcomingCount} services due in 14 days. Breakdown assets: ${maintenance.breakdownCount}${names}.`
    );
  }
  if (reports && reports.count) {
    const blockers = reports.blockers.length ? ` Blockers mentioned: ${reports.blockers.join(' | ')}` : '';
    lines.push(`Daily reports submitted today: ${reports.count}.${blockers}`);
  }

  if (lines.length === 1) {
    lines.push('No notable activity found in the modules this user can read.');
  }

  const snapshot = lines.join('\n');

  const result = await getAI().complete({
    system:
      'You are the chief-of-staff AI for a business command center. From the snapshot, produce: ' +
      '1) Top 3 priorities today, 2) Risks needing attention, 3) Quick wins. ' +
      'Be specific and terse — max 10 bullet lines total.',
    messages: [{ role: 'user', content: snapshot }],
    maxTokens: 500,
  });

  return { brief: result.text, provider: result.provider, snapshot };
}

// ---------------------------------------------------------------------------
// Intelligent search
// ---------------------------------------------------------------------------

/** Compact one-line label for a search hit, used in the synthesis prompt. */
function itemLabel(group, item) {
  switch (group) {
    case 'tasks':
      return `${item.title} [${item.status}]`;
    case 'goals':
      return `${item.title} [${item.type}/${item.status}]`;
    case 'contacts':
      return `${item.name}${item.company ? ` (${item.company})` : ''} [${item.type}]`;
    case 'projects':
      return `${item.name} [${item.status}]`;
    case 'renewals':
      return `${item.title} due ${fmtDate(item.dueDate)} [${item.status}]`;
    case 'tickets':
      return `${item.subject} [${item.status}/${item.priority}]`;
    case 'products':
      return `${item.name}${item.sku ? ` (${item.sku})` : ''} [${item.category}]`;
    case 'assets':
      return `${item.name}${item.code ? ` (${item.code})` : ''} [${item.status}]`;
    case 'transactions':
      return `${item.type} ${item.amount} on ${fmtDate(item.date)}${item.description ? ` — ${item.description}` : ''}`;
    case 'reports':
      return `${item.user?.name || 'report'} on ${fmtDate(item.date)}`;
    default:
      return '';
  }
}

/**
 * Cross-module search over every collection whose module the user can read.
 * Each collection contributes at most 5 lean hits with minimal fields.
 * Optionally asks the AI provider for a short synthesis of the result set.
 *
 * Returns { query, results, totalHits, synthesis, provider } where `results`
 * only contains non-empty groups shaped { count, items }.
 */
export async function intelligentSearch(
  query,
  permissions,
  isSuperAdmin,
  { withSynthesis = true, user = null } = {}
) {
  const can = makeCan(permissions, isSuperAdmin);
  const rx = new RegExp(escapeRegExp(query), 'i');

  // [group, promise] pairs, gathered in parallel. Insertion order defines
  // the display order of result groups.
  const searches = [];
  const add = (group, promise) => searches.push(promise.then((items) => [group, items]));

  if (can(MODULES.TASKS)) {
    add('tasks', Task.find({ $or: [{ title: rx }, { description: rx }] }).select('title status').limit(5).lean());
  }
  if (can(MODULES.GOALS)) {
    add('goals', Goal.find({ $or: [{ title: rx }, { description: rx }] }).select('title status type').limit(5).lean());
  }
  if (can(MODULES.RRRMAS)) {
    add(
      'contacts',
      Contact.find({ $or: [{ name: rx }, { company: rx }, { email: rx }] }).select('name company type').limit(5).lean()
    );
    add('projects', Project.find({ $or: [{ name: rx }, { description: rx }] }).select('name status').limit(5).lean());
    add('renewals', Renewal.find({ $or: [{ title: rx }, { notes: rx }] }).select('title dueDate status').limit(5).lean());
    add(
      'tickets',
      SupportTicket.find({ $or: [{ subject: rx }, { description: rx }] }).select('subject status priority').limit(5).lean()
    );
  }
  if (can(MODULES.PRODUCTS)) {
    add(
      'products',
      Product.find({ $or: [{ name: rx }, { sku: rx }, { description: rx }] }).select('name sku category').limit(5).lean()
    );
  }
  if (can(MODULES.MAINTENANCE)) {
    add(
      'assets',
      Asset.find({ $or: [{ name: rx }, { code: rx }, { location: rx }] }).select('name code status').limit(5).lean()
    );
  }
  if (can(MODULES.FINANCE)) {
    add(
      'transactions',
      Transaction.find({ $or: [{ description: rx }, { category: rx }, { 'party.name': rx }] })
        .select('description amount type date')
        .limit(5)
        .lean()
    );
  }
  if (can(MODULES.EVENING_REPORTING)) {
    // Employees only search their OWN reports; employee_analytics readers see all.
    const seesAll = can(MODULES.EMPLOYEE_ANALYTICS);
    const filter = { $or: [{ workDone: rx }, { blockers: rx }] };
    if (!seesAll) filter.user = user?._id;
    if (seesAll || user?._id) {
      add(
        'reports',
        DailyReport.find(filter)
          .select('date user')
          .populate({ path: 'user', select: 'name' })
          .sort({ date: -1 })
          .limit(5)
          .lean()
      );
    }
  }

  const settled = await Promise.all(searches);

  const results = {};
  let totalHits = 0;
  for (const [group, items] of settled) {
    if (items.length) {
      results[group] = { count: items.length, items };
      totalHits += items.length;
    }
  }

  let synthesis = null;
  let provider = null;

  if (withSynthesis && totalHits > 0) {
    const summaryLines = Object.entries(results).map(
      ([group, g]) => `${group} (${g.count}): ${g.items.map((i) => itemLabel(group, i)).join('; ')}`
    );
    const result = await getAI().complete({
      system:
        'You are the intelligent search assistant for a business command center. ' +
        'Given grouped search results, tell the user in 2-4 short sentences what was found ' +
        'and where they should look first.',
      messages: [
        { role: 'user', content: `Search query: "${query}"\nResults:\n${summaryLines.join('\n')}` },
      ],
      maxTokens: 250,
    });
    synthesis = result.text;
    provider = result.provider;
  }

  return { query, results, totalHits, synthesis, provider };
}
