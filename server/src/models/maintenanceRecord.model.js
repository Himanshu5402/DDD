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
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },

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
