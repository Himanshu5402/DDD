import mongoose from 'mongoose';
import Task, { TASK_STATUSES } from '../../models/task.model.js';
import Company from '../../models/company.model.js';
import User from '../../models/user.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';
import { getAI } from '../../services/ai/index.js';

const ENTITY = 'task';

const LIST_POPULATE = [
  { path: 'assignees', select: 'name email avatar designation' },
  { path: 'createdBy', select: 'name email avatar' },
  { path: 'assignedBy', select: 'name email avatar' },
  { path: 'company', select: 'name code color' },
];

const DETAIL_POPULATE = [
  { path: 'assignees', select: 'name email avatar designation' },
  { path: 'company', select: 'name code color' },
  { path: 'watchers', select: 'name email' },
  { path: 'createdBy', select: 'name email avatar' },
  { path: 'assignedBy', select: 'name email avatar designation' },
  { path: 'delegationChain.from', select: 'name email avatar designation' },
  { path: 'delegationChain.to', select: 'name email avatar designation' },
  { path: 'comments.author', select: 'name email avatar' },
  { path: 'timeLogs.user', select: 'name email' },
  { path: 'checklist.doneBy', select: 'name' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the Mongo filter shared by list + board. */
function buildFilter(query = {}, user) {
  const filter = {};

  // Top-level tasks by default; pass parent=<id> to list a task's subtasks,
  // or includeSubtasks=true to include everything.
  if (query.parent) filter.parent = query.parent;
  else if (!query.includeSubtasks) filter.parent = null;

  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.assignee) filter.assignees = query.assignee;
  if (query.tag) filter.tags = query.tag;
  if (query.company) filter.company = query.company;
  if (query.goal) filter.goal = query.goal;
  if (query.project) filter.project = query.project;

  if (query.mine && user) {
    filter.$or = [{ assignees: user._id }, { watchers: user._id }, { createdBy: user._id }];
  }

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$and = [...(filter.$and || []), { $or: [{ title: rx }, { description: rx }] }];
  }

  if (query.dueFrom || query.dueTo) {
    filter.dueDate = {};
    if (query.dueFrom) filter.dueDate.$gte = query.dueFrom;
    if (query.dueTo) filter.dueDate.$lte = query.dueTo;
  }

  return filter;
}

export async function listTasks(query, user) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query, user);

  const [items, total] = await Promise.all([
    Task.find(filter).populate(LIST_POPULATE).sort(sort).skip(skip).limit(limit),
    Task.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

/** Kanban board: top-level tasks grouped into one column per status. */
export async function getBoard(query, user) {
  const filter = buildFilter({ ...query, includeSubtasks: false }, user);
  const tasks = await Task.find(filter).populate(LIST_POPULATE).sort({ order: 1, createdAt: 1 });

  const columns = TASK_STATUSES.map((status) => ({ status, tasks: [] }));
  const byStatus = Object.fromEntries(columns.map((c) => [c.status, c]));
  for (const task of tasks) byStatus[task.status]?.tasks.push(task);

  return { columns };
}

export async function getTask(id) {
  const task = await Task.findById(id).populate(DETAIL_POPULATE);
  if (!task) throw ApiError.notFound('Task not found');
  const subtasks = await Task.find({ parent: id }).populate(LIST_POPULATE).sort({ order: 1, createdAt: 1 });
  return { task, subtasks };
}

async function nextOrderFor(status) {
  const last = await Task.findOne({ status, parent: null }).sort({ order: -1 }).select('order');
  return (last?.order ?? -1) + 1;
}

export async function createTask(data, user) {
  if (data.parent) {
    const parent = await Task.findById(data.parent);
    if (!parent) throw ApiError.badRequest('Parent task does not exist');
  }
  if (data.company) {
    const company = await Company.findById(data.company);
    if (!company) throw ApiError.badRequest('Company does not exist');
  }

  const customFields = data.customFields
    ? await validateCustomFields(ENTITY, data.customFields)
    : {};

  const status = data.status || 'todo';
  const watchers = new Set((data.watchers || []).map(String));
  watchers.add(String(user._id)); // creator watches by default

  const assignees = data.assignees || [];

  const task = await Task.create({
    ...data,
    status,
    customFields,
    createdBy: user._id,
    watchers: [...watchers],
    // First assignment hop recorded at creation time.
    assignedBy: assignees.length ? user._id : null,
    delegationChain: assignees.length ? [{ from: user._id, to: assignees, at: new Date() }] : [],
    order: data.parent ? 0 : await nextOrderFor(status),
    completedAt: status === 'done' ? new Date() : undefined,
  });

  return Task.findById(task._id).populate(LIST_POPULATE);
}

const UPDATABLE = [
  'title', 'description', 'priority', 'assignees', 'watchers',
  'startDate', 'dueDate', 'tags', 'company', 'goal', 'project', 'estimatedMinutes', 'recurrence',
];

export async function updateTask(id, data, user) {
  const task = await Task.findById(id);
  if (!task) throw ApiError.notFound('Task not found');

  const prevAssignees = (task.assignees || []).map(String);

  for (const f of UPDATABLE) if (data[f] !== undefined) task[f] = data[f];

  // Record assignment changes as a hop in the delegation chain.
  let addedAssignees = [];
  if (data.assignees !== undefined) {
    const next = (data.assignees || []).map(String);
    addedAssignees = next.filter((a) => !prevAssignees.includes(a));
    const changed = addedAssignees.length || next.length !== prevAssignees.length;
    if (changed && user) {
      task.assignedBy = user._id;
      task.delegationChain.push({ from: user._id, to: data.assignees, at: new Date() });
    }
  }

  if (data.customFields !== undefined) {
    const merged = { ...task.customFields, ...data.customFields };
    task.customFields = await validateCustomFields(ENTITY, merged, { partial: true });
  }

  await task.save();
  const populated = await Task.findById(task._id).populate(LIST_POPULATE);
  return { task: populated, addedAssignees };
}

/**
 * Delegate (re-assign) a task down the org chart.
 *
 * Industry-standard flow: admin assigns a task to a manager; the manager
 * delegates it to member(s) of their team. Rules:
 *  - Privileged users (super admin, tasks:update/manage) may delegate to anyone.
 *  - Otherwise the actor must be a CURRENT ASSIGNEE, and every target must be
 *    one of their direct reports (User.reportsTo === actor) — a manager can
 *    only delegate within their own team.
 *  - The actor (and any previous assignees) become watchers, so the delegator
 *    keeps full visibility of the task after handing it off.
 *  - Every hop is recorded in delegationChain for the audit trail.
 *
 * Returns { task, targets, prevAssignees } for the controller to notify.
 */
export async function delegateTask(id, { assignees: targetIds, note }, { user, permissions, isSuperAdmin }) {
  const task = await Task.findById(id);
  if (!task) throw ApiError.notFound('Task not found');
  if (task.status === 'done') throw ApiError.badRequest('Cannot delegate a completed task');

  const targets = await User.find({ _id: { $in: targetIds }, isActive: true }).select(
    'name email reportsTo'
  );
  if (targets.length !== targetIds.length) {
    throw ApiError.badRequest('One or more target users do not exist or are inactive');
  }

  const uid = String(user._id);
  const privileged =
    isSuperAdmin ||
    permissions?.has('tasks:update') ||
    permissions?.has('tasks:manage');

  if (!privileged) {
    const isAssignee = (task.assignees || []).some((a) => String(a) === uid);
    if (!isAssignee) {
      throw ApiError.forbidden('You can only delegate tasks assigned to you', {
        code: 'NOT_TASK_ASSIGNEE',
      });
    }
    const outsideTeam = targets.filter((t) => String(t.reportsTo) !== uid);
    if (outsideTeam.length) {
      throw ApiError.forbidden(
        `You can only delegate to your direct reports (${outsideTeam.map((t) => t.name).join(', ')} do not report to you)`,
        { code: 'NOT_DIRECT_REPORT' }
      );
    }
  }

  const prevAssignees = (task.assignees || []).map(String);

  // Delegator + previous assignees keep visibility as watchers.
  const watchers = new Set((task.watchers || []).map(String));
  watchers.add(uid);
  prevAssignees.forEach((a) => watchers.add(a));
  targetIds.forEach((t) => watchers.delete(String(t))); // assignees need not watch

  task.assignees = targetIds;
  task.watchers = [...watchers];
  task.assignedBy = user._id;
  task.delegationChain.push({ from: user._id, to: targetIds, note: note || '', at: new Date() });

  await task.save();
  const populated = await Task.findById(task._id).populate(LIST_POPULATE);
  return { task: populated, targets, prevAssignees };
}

/** Change status (and Kanban position). Handles completion + recurrence. */
export async function moveTask(id, { status, order }, user) {
  const task = await Task.findById(id);
  if (!task) throw ApiError.notFound('Task not found');
  if (status && !TASK_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status');

  const wasDone = task.status === 'done';
  if (status) task.status = status;
  if (order !== undefined) task.order = order;

  let spawned = null;
  const completedNow = task.status === 'done' && !wasDone;
  if (completedNow) {
    task.completedAt = new Date();
    spawned = await maybeSpawnRecurrence(task, user);
  } else if (task.status !== 'done') {
    task.completedAt = undefined;
  }

  await task.save();
  const populated = await Task.findById(task._id).populate(LIST_POPULATE);
  return { task: populated, spawned, completedNow };
}

/** If the task recurs, create the next occurrence. Returns it (or null). */
async function maybeSpawnRecurrence(task, user) {
  const rec = task.recurrence;
  if (!rec || rec.frequency === 'none') return null;

  const base = task.dueDate || new Date();
  const nextDue = addInterval(base, rec.frequency, rec.interval || 1);
  if (rec.until && nextDue > rec.until) return null;

  let nextStart;
  if (task.startDate) nextStart = addInterval(task.startDate, rec.frequency, rec.interval || 1);

  const clone = await Task.create({
    title: task.title,
    description: task.description,
    status: 'todo',
    priority: task.priority,
    assignees: task.assignees,
    watchers: task.watchers,
    createdBy: user?._id || task.createdBy,
    startDate: nextStart,
    dueDate: nextDue,
    tags: task.tags,
    estimatedMinutes: task.estimatedMinutes,
    checklist: (task.checklist || []).map((c) => ({ text: c.text, done: false })),
    recurrence: task.recurrence,
    customFields: task.customFields,
    order: await nextOrderFor('todo'),
  });
  return clone;
}

function addInterval(date, frequency, interval) {
  const d = new Date(date);
  if (frequency === 'daily') d.setDate(d.getDate() + interval);
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7 * interval);
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + interval);
  return d;
}

export async function deleteTask(id) {
  const task = await Task.findById(id);
  if (!task) throw ApiError.notFound('Task not found');
  await Task.deleteMany({ parent: id }); // cascade subtasks
  await task.deleteOne();
  return { success: true };
}

export async function addComment(id, userId, body) {
  const task = await Task.findByIdAndUpdate(
    id,
    { $push: { comments: { author: userId, body } } },
    { new: true }
  ).populate({ path: 'comments.author', select: 'name email avatar' });
  if (!task) throw ApiError.notFound('Task not found');
  return task.comments[task.comments.length - 1];
}

export async function addChecklistItem(id, text) {
  const task = await Task.findByIdAndUpdate(id, { $push: { checklist: { text } } }, { new: true });
  if (!task) throw ApiError.notFound('Task not found');
  return task.checklist;
}

export async function toggleChecklistItem(id, itemId, userId) {
  const task = await Task.findById(id);
  if (!task) throw ApiError.notFound('Task not found');
  const item = task.checklist.id(itemId);
  if (!item) throw ApiError.notFound('Checklist item not found');
  item.done = !item.done;
  item.doneAt = item.done ? new Date() : undefined;
  item.doneBy = item.done ? userId : undefined;
  await task.save();
  return task.checklist;
}

export async function logTime(id, userId, minutes, note) {
  const task = await Task.findByIdAndUpdate(
    id,
    { $push: { timeLogs: { user: userId, minutes, note, loggedAt: new Date() } } },
    { new: true }
  );
  if (!task) throw ApiError.notFound('Task not found');
  return { timeSpentMinutes: task.timeSpentMinutes, timeLogs: task.timeLogs };
}

/** AI summary of the task, its checklist and discussion. */
export async function aiSummary(id) {
  const { task, subtasks } = await getTask(id);
  const ai = getAI();

  const lines = [
    `Title: ${task.title}`,
    `Status: ${task.status} | Priority: ${task.priority}`,
    task.dueDate ? `Due: ${new Date(task.dueDate).toDateString()}` : null,
    task.description ? `Description: ${task.description}` : null,
    subtasks.length ? `Subtasks: ${subtasks.map((s) => `${s.title} (${s.status})`).join(', ')}` : null,
    task.checklist?.length
      ? `Checklist: ${task.checklist.map((c) => `[${c.done ? 'x' : ' '}] ${c.text}`).join('; ')}`
      : null,
    task.comments?.length
      ? `Recent comments:\n${task.comments.slice(-8).map((c) => `- ${c.body}`).join('\n')}`
      : null,
  ].filter(Boolean);

  const result = await ai.complete({
    system:
      'You are a project assistant. Summarize the task status crisply for a busy manager: ' +
      'current state, what is blocking or outstanding, and the recommended next action. Use 3-5 short bullet points.',
    messages: [{ role: 'user', content: lines.join('\n') }],
    maxTokens: 400,
  });

  return { summary: result.text, provider: result.provider, model: result.model };
}

export function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}
