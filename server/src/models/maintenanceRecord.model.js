import mongoose from 'mongoose';

const { Schema } = mongoose;

export const MAINTENANCE_TYPES = Object.freeze([
  'preventive',
  'breakdown',
  'inspection',
  'calibration',
  'amc_service',
]);

export const MAINTENANCE_STATUSES = Object.freeze([
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

const partUsedSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    qty: { type: Number, default: 1 },
    cost: { type: Number, default: 0 },
  },
  { _id: true }
);

const maintenanceRecordSchema = new Schema(
  {
    // What is being maintained. `title` is a free-text label (e.g. "Water tank
    // repair", "Wire repair", "System / CPU repair") so tasks that aren't a
    // catalogued Asset can still be tracked; `asset` optionally links a real one.
    title: { type: String, trim: true, default: '' },
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', default: null, index: true },

    type: { type: String, enum: MAINTENANCE_TYPES, required: true, index: true },
    status: { type: String, enum: MAINTENANCE_STATUSES, default: 'scheduled', index: true },

    scheduledFor: { type: Date, required: true, index: true },
    completedAt: { type: Date },

    // Free-text technician / vendor name; performedBy links an internal user.
    technician: { type: String, default: '' },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    cost: { type: Number, min: 0, default: 0 },
    notes: { type: String, default: '' },

    partsUsed: [partUsedSchema],

    // Reminder tracking — admins are alerted as `scheduledFor` approaches. Each
    // stage (upcoming / due_soon / due / overdue) fires at most once per cycle;
    // the list resets when the schedule changes or the job is re-opened.
    reminderDaysBefore: { type: Number, min: 0, max: 90, default: 2 },
    remindersSent: { type: [String], default: [] },
    lastRemindedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Per-asset maintenance history, newest first.
maintenanceRecordSchema.index({ asset: 1, scheduledFor: -1 });

export default mongoose.model('MaintenanceRecord', maintenanceRecordSchema);
