import mongoose from 'mongoose';

const { Schema } = mongoose;

export const REPORT_MOODS = Object.freeze(['great', 'good', 'okay', 'stressed', 'blocked']);

/**
 * Approval state machine (mirrors the org chart):
 *   submitted ──(manager approve)──▶ manager_approved ──(admin approve)──▶ admin_approved ✓
 *      │                                    │
 *      └──(manager reject)──▶ manager_rejected   └──(admin reject)──▶ admin_rejected
 * A rejected report can be edited and re-submitted, which resets it to `submitted`.
 * Employees with no manager go straight to admin review from `submitted`.
 */
export const REPORT_STATUSES = Object.freeze([
  'submitted',
  'manager_approved',
  'manager_rejected',
  'admin_approved',
  'admin_rejected',
]);

export const ATTACHMENT_TYPES = Object.freeze(['image', 'video']);

const meetingSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, default: 30 },
  },
  { _id: true }
);

// A photo/video attached to a report (stored via the storage provider).
const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    key: { type: String, default: '' }, // provider key, for deletion
    type: { type: String, enum: ATTACHMENT_TYPES, required: true },
    name: { type: String, default: '' },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
  },
  { _id: true }
);

// One approval decision (manager level or admin level).
const reviewSchema = new Schema(
  {
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    reason: { type: String, default: '', trim: true }, // required by service on reject
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const gitCommitSchema = new Schema(
  {
    repo: { type: String, default: '' },
    message: { type: String, required: true, trim: true },
    hash: { type: String, default: '' },
  },
  { _id: true }
);

const dailyReportSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Normalized to start of day; one report per user per day.
    date: { type: Date, required: true, index: true },

    workDone: { type: String, required: true, trim: true },
    tomorrowPlan: { type: String, default: '' },
    blockers: { type: String, default: '' },

    hoursWorked: { type: Number, min: 0, max: 24, default: 8 },

    meetings: [meetingSchema],
    gitCommits: [gitCommitSchema],

    // Cross-module link (loose coupling via refs; modules built separately).
    tasksWorked: [{ type: Schema.Types.ObjectId, ref: 'Task' }],

    remarks: { type: String, default: '' },
    mood: { type: String, enum: REPORT_MOODS, default: 'good' },

    attachments: [attachmentSchema],

    status: { type: String, enum: REPORT_STATUSES, default: 'submitted', index: true },

    // Two-level review chain. Each holds the latest decision at that level.
    managerReview: { type: reviewSchema, default: null },
    adminReview: { type: reviewSchema, default: null },

    aiSummary: { type: String, default: '' },

    // HRMS mirror: the HRMS evening-report code (e.g. ER-101) this report was
    // synced from. Absent on reports submitted natively in DDD.
    externalId: { type: String, trim: true, unique: true, sparse: true },
  },
  { timestamps: true }
);

dailyReportSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model('DailyReport', dailyReportSchema);
