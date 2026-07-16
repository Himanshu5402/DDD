import mongoose from 'mongoose';

const { Schema } = mongoose;

export const REPORT_MOODS = Object.freeze(['great', 'good', 'okay', 'stressed', 'blocked']);
export const REPORT_STATUSES = Object.freeze(['submitted', 'reviewed']);

const meetingSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, default: 30 },
  },
  { _id: true }
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

    status: { type: String, enum: REPORT_STATUSES, default: 'submitted', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date },

    aiSummary: { type: String, default: '' },
  },
  { timestamps: true }
);

dailyReportSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model('DailyReport', dailyReportSchema);
