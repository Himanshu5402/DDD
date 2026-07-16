import mongoose from 'mongoose';
import Goal from '../../models/goal.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';
import { validateValues as validateCustomFields } from '../customFields/customFields.service.js';
import { getAI } from '../../services/ai/index.js';

const ENTITY = 'goal';

const LIST_POPULATE = [
  { path: 'owner', select: 'name email avatar' },
  { path: 'collaborators', select: 'name email avatar' },
];

const DETAIL_POPULATE = [
  { path: 'owner', select: 'name email avatar' },
  { path: 'collaborators', select: 'name email avatar' },
  { path: 'createdBy', select: 'name email avatar' },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build the Mongo filter for the goal list. */
function buildFilter(query = {}, user) {
  const filter = {};

  // Top-level goals by default; pass parent=<id> to list a goal's sub-goals,
  // or includeChildren=true to include everything.
  if (query.parent) filter.parent = query.parent;
  else if (!query.includeChildren) filter.parent = null;

  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.owner) filter.owner = query.owner;
  if (query.tag) filter.tags = query.tag;

  if (query.mine && user) {
    filter.$or = [{ owner: user._id }, { collaborators: user._id }, { createdBy: user._id }];
  }

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$and = [...(filter.$and || []), { $or: [{ title: rx }, { description: rx }] }];
  }

  return filter;
}

export async function listGoals(query, user) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 25 });
  const filter = buildFilter(query, user);

  const [items, total] = await Promise.all([
    Goal.find(filter).populate(LIST_POPULATE).sort(sort).skip(skip).limit(limit),
    Goal.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getGoal(id) {
  const goal = await Goal.findById(id).populate(DETAIL_POPULATE);
  if (!goal) throw ApiError.notFound('Goal not found');
  const children = await Goal.find({ parent: id }).populate(LIST_POPULATE).sort({ createdAt: 1 });
  return { goal, children };
}

export async function createGoal(data, user) {
  if (data.parent) {
    const parent = await Goal.findById(data.parent);
    if (!parent) throw ApiError.badRequest('Parent goal does not exist');
  }

  const customFields = data.customFields
    ? await validateCustomFields(ENTITY, data.customFields)
    : {};

  const status = data.status || 'not_started';

  const goal = await Goal.create({
    ...data,
    status,
    customFields,
    owner: data.owner || user._id,
    createdBy: user._id,
    achievedAt: status === 'achieved' ? new Date() : undefined,
  });

  return Goal.findById(goal._id).populate(LIST_POPULATE);
}

const UPDATABLE = [
  'title', 'description', 'type', 'status', 'owner', 'collaborators',
  'startDate', 'targetDate', 'tags', 'progress',
];

/** Mark achieved (stamping achievedAt) when progress reaches 100. */
function autoAchieve(goal) {
  if (goal.progress >= 100 && goal.status !== 'achieved') {
    goal.status = 'achieved';
    goal.achievedAt = new Date();
  }
}

export async function updateGoal(id, data, _user) {
  const goal = await Goal.findById(id);
  if (!goal) throw ApiError.notFound('Goal not found');

  const wasAchieved = goal.status === 'achieved';

  for (const f of UPDATABLE) if (data[f] !== undefined) goal[f] = data[f];

  // Merge target so a partial update (e.g. metric + targetValue from the form)
  // does not wipe the tracked currentValue.
  if (data.target !== undefined) {
    const existing = goal.target?.toObject ? goal.target.toObject() : goal.target || {};
    goal.target = { ...existing, ...data.target };
  }

  if (data.customFields !== undefined) {
    const merged = { ...goal.customFields, ...data.customFields };
    goal.customFields = await validateCustomFields(ENTITY, merged, { partial: true });
  }

  // Achievement tracking: stamp achievedAt when the goal becomes achieved,
  // clear it when it is moved back to any other status.
  if (goal.status === 'achieved' && !wasAchieved) goal.achievedAt = new Date();
  else if (goal.status !== 'achieved') goal.achievedAt = undefined;

  autoAchieve(goal);

  await goal.save();
  return Goal.findById(goal._id).populate(LIST_POPULATE);
}

/**
 * Update progress directly (0-100), and/or record the target's currentValue.
 * When currentValue is given and the goal has a positive targetValue, progress
 * is derived from the currentValue/targetValue ratio.
 */
export async function updateProgress(id, { progress, currentValue } = {}) {
  const goal = await Goal.findById(id);
  if (!goal) throw ApiError.notFound('Goal not found');

  if (progress !== undefined) goal.progress = progress;

  if (currentValue !== undefined) {
    const existing = goal.target?.toObject ? goal.target.toObject() : goal.target || {};
    goal.target = { ...existing, currentValue };
    if (existing.targetValue > 0) {
      goal.progress = Math.min(100, Math.round((currentValue / existing.targetValue) * 100));
    }
  }

  autoAchieve(goal);

  await goal.save();
  return Goal.findById(goal._id).populate(LIST_POPULATE);
}

export async function addMilestone(id, { title, dueDate }) {
  const goal = await Goal.findByIdAndUpdate(
    id,
    { $push: { milestones: { title, dueDate } } },
    { new: true }
  );
  if (!goal) throw ApiError.notFound('Goal not found');
  return goal.milestones;
}

export async function toggleMilestone(id, itemId) {
  const goal = await Goal.findById(id);
  if (!goal) throw ApiError.notFound('Goal not found');
  const item = goal.milestones.id(itemId);
  if (!item) throw ApiError.notFound('Milestone not found');
  item.done = !item.done;
  item.doneAt = item.done ? new Date() : undefined;
  await goal.save();
  return goal.milestones;
}

export async function addChecklistItem(id, text) {
  const goal = await Goal.findByIdAndUpdate(id, { $push: { checklist: { text } } }, { new: true });
  if (!goal) throw ApiError.notFound('Goal not found');
  return goal.checklist;
}

export async function toggleChecklistItem(id, itemId) {
  const goal = await Goal.findById(id);
  if (!goal) throw ApiError.notFound('Goal not found');
  const item = goal.checklist.id(itemId);
  if (!item) throw ApiError.notFound('Checklist item not found');
  item.done = !item.done;
  await goal.save();
  return goal.checklist;
}

export async function deleteGoal(id) {
  const goal = await Goal.findById(id);
  if (!goal) throw ApiError.notFound('Goal not found');
  await Goal.updateMany({ parent: id }, { $set: { parent: null } }); // re-parent sub-goals to top level
  await goal.deleteOne();
  return { success: true };
}

/** AI suggestions: next milestones, risks and how to stay on track. */
export async function aiSuggestions(id) {
  const goal = await Goal.findById(id);
  if (!goal) throw ApiError.notFound('Goal not found');
  const ai = getAI();

  const target = goal.target || {};
  const lines = [
    `Goal: ${goal.title}`,
    `Type: ${goal.type} | Status: ${goal.status} | Progress: ${goal.progress ?? 0}%`,
    goal.description ? `Description: ${goal.description}` : null,
    target.metric
      ? `Target: ${target.metric} — ${target.currentValue ?? 0}/${target.targetValue ?? '?'} ${target.unit || ''}`.trim()
      : null,
    goal.startDate ? `Start: ${new Date(goal.startDate).toDateString()}` : null,
    goal.targetDate ? `Target date: ${new Date(goal.targetDate).toDateString()}` : null,
    goal.milestones?.length
      ? `Milestones: ${goal.milestones
          .map((m) => `[${m.done ? 'x' : ' '}] ${m.title}${m.dueDate ? ` (due ${new Date(m.dueDate).toDateString()})` : ''}`)
          .join('; ')}`
      : null,
    goal.checklist?.length
      ? `Checklist: ${goal.checklist.map((c) => `[${c.done ? 'x' : ' '}] ${c.text}`).join('; ')}`
      : null,
  ].filter(Boolean);

  const result = await ai.complete({
    system:
      'You are a goal-planning assistant. Given a goal and its current state, suggest concrete ' +
      'next steps: milestones to add, risks to watch, and how to get (or stay) on track. ' +
      'Use 3-6 short, specific, actionable bullet points.',
    messages: [{ role: 'user', content: lines.join('\n') }],
    maxTokens: 400,
  });

  return { suggestions: result.text, provider: result.provider, model: result.model };
}

export function isValidObjectId(id) {
  return mongoose.isValidObjectId(id);
}
