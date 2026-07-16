import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TASK_STATUSES = Object.freeze(['todo', 'in_progress', 'in_review', 'blocked', 'done']);
export const TASK_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);
export const RECURRENCE_FREQUENCIES = Object.freeze(['none', 'daily', 'weekly', 'monthly']);

const commentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
  },
  { timestamps: true, _id: true }
);

const checklistItemSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
    doneAt: { type: Date },
    doneBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const timeLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    minutes: { type: Number, required: true, min: 1 },
    note: { type: String, default: '' },
    loggedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const recurrenceSchema = new Schema(
  {
    frequency: { type: String, enum: RECURRENCE_FREQUENCIES, default: 'none' },
    interval: { type: Number, default: 1, min: 1 }, // every N days/weeks/months
    until: { type: Date },
  },
  { _id: false }
);

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    status: { type: String, enum: TASK_STATUSES, default: 'todo', index: true },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium', index: true },

    assignees: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    watchers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    startDate: { type: Date },
    dueDate: { type: Date, index: true },
    completedAt: { type: Date },

    tags: [{ type: String, trim: true }],

    // Subtasks: a task with a `parent` is a child of that task.
    parent: { type: Schema.Types.ObjectId, ref: 'Task', default: null, index: true },

    // Which of the owner's companies this work belongs to.
    company: { type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true },

    // Cross-module links (loose coupling via refs; modules built separately).
    goal: { type: Schema.Types.ObjectId, ref: 'Goal', default: null, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },

    // Position within its status column on the Kanban board.
    order: { type: Number, default: 0 },

    estimatedMinutes: { type: Number, min: 0 },
    timeLogs: [timeLogSchema],
    checklist: [checklistItemSchema],
    comments: [commentSchema],

    recurrence: { type: recurrenceSchema, default: () => ({ frequency: 'none' }) },

    // Dynamic admin-defined fields (entityType 'task').
    customFields: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Total logged time (minutes) across all time logs.
taskSchema.virtual('timeSpentMinutes').get(function timeSpent() {
  return (this.timeLogs || []).reduce((sum, l) => sum + (l.minutes || 0), 0);
});

// Checklist completion, e.g. { total, done }.
taskSchema.virtual('checklistProgress').get(function progress() {
  const items = this.checklist || [];
  return { total: items.length, done: items.filter((i) => i.done).length };
});

taskSchema.index({ status: 1, order: 1 });
taskSchema.index({ title: 'text', description: 'text' });

export default mongoose.model('Task', taskSchema);
