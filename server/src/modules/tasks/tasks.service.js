import mongoose from 'mongoose';
import Task, { TASK_STATUSES } from '../../models/task.model.js';
import Company from '../../models/company.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';
import { getAI } from '../../services/ai/index.js';

const ENTITY = 'task';

const LIST_POPULATE = [
  { path: 'assignees', select: 'name email avatar designation' },
  { path: 'createdBy', select: 'name email avatar' },
  { path: 'company', select: 'name code color' },
];

const DETAIL_POPULATE = [
  { path: 'assignees', select: 'name email avatar designation' },
  { path: 'company', select: 'name code color' },
  { path: 'watchers', select: 'name email' },
  { path: 'createdBy', select: 'name email avatar' },
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

  const task = await Task.create({
    ...data,
    status,
    customFields,
    createdBy: user._id,
    watchers: [...watchers],
    order: data.parent ? 0 : await nextOrderFor(status),
    completedAt: status === 'done' ? new Date() : undefined,
  });

  return Task.findById(task._id).populate(LIST_POPULATE);
}

const UPDATABLE = [
  'title', 'description', 'priority', 'assignees', 'watchers',
  'startDate', 'dueDate', 'tags', 'company', 'goal', 'project', 'estimatedMinutes', 'recurrence',
];

export async function updateTask(id, data, _user) {
  const task = await Task.findById(id);
  if (!task) throw ApiError.notFound('Task not found');

  for (const f of UPDATABLE) if (data[f] !== undefined) task[f] = data[f];

  if (data.customFields !== undefined) {
    const merged = { ...task.customFields, ...data.customFields };
    task.customFields = await validateCustomFields(ENTITY, merged, { partial: true });
  }

  await task.save();
  return Task.findById(task._id).populate(LIST_POPULATE);
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
  if (task.status === 'done' && !wasDone) {
    task.completedAt = new Date();
    spawned = await maybeSpawnRecurrence(task, user);
  } else if (task.status !== 'done') {
    task.completedAt = undefined;
  }

  await task.save();
  const populated = await Task.findById(task._id).populate(LIST_POPULATE);
  return { task: populated, spawned };
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
