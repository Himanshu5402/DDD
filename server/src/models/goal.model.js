import mongoose from 'mongoose';

const { Schema } = mongoose;

export const GOAL_TYPES = Object.freeze([
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
  'two_year',
  'five_year',
  'lifetime',
  'custom',
]);

export const GOAL_STATUSES = Object.freeze([
  'not_started',
  'in_progress',
  'on_track',
  'at_risk',
  'achieved',
  'abandoned',
]);

const milestoneSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    dueDate: { type: Date },
    done: { type: Boolean, default: false },
    doneAt: { type: Date },
  },
  { _id: true }
);

const checklistItemSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
  },
  { _id: true }
);

// Measurable target, e.g. { metric: 'New clients', unit: 'clients', targetValue: 100, currentValue: 40 }.
const targetSchema = new Schema(
  {
    metric: { type: String, trim: true },
    unit: { type: String, trim: true },
    targetValue: { type: Number },
    currentValue: { type: Number, default: 0 },
  },
  { _id: false }
);

const goalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    type: { type: String, enum: GOAL_TYPES, default: 'monthly', index: true },
    status: { type: String, enum: GOAL_STATUSES, default: 'not_started', index: true },

    owner: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    collaborators: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Goal tree: a goal with a `parent` is a sub-goal of that goal (e.g. a
    // monthly goal rolling up into a yearly one).
    parent: { type: Schema.Types.ObjectId, ref: 'Goal', default: null, index: true },

    startDate: { type: Date },
    targetDate: { type: Date, index: true },
    achievedAt: { type: Date },

    // Completion percentage (0-100). Manually settable, or derived from the
    // target's currentValue/targetValue ratio.
    progress: { type: Number, min: 0, max: 100, default: 0 },

    target: { type: targetSchema, default: () => ({}) },

    milestones: [milestoneSchema],
    checklist: [checklistItemSchema],

    tags: [{ type: String, trim: true }],

    // Dynamic admin-defined fields (entityType 'goal').
    customFields: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Milestone completion, e.g. { total, done }.
goalSchema.virtual('milestoneProgress').get(function milestoneProgress() {
  const items = this.milestones || [];
  return { total: items.length, done: items.filter((m) => m.done).length };
});

goalSchema.index({ type: 1, status: 1 });

export default mongoose.model('Goal', goalSchema);
