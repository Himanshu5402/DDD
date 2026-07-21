import mongoose from 'mongoose';
import { LEAVE_TYPES } from './employeeRecord.model.js';

const { Schema } = mongoose;

export { LEAVE_TYPES };

/**
 * Per-employee, per-year leave entitlement vs. usage, mirrored from HRMS.
 * balance is derived (entitled - taken). One doc per {user, year, leaveType}.
 */
const leaveBalanceSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hrmsId: { type: String, trim: true, default: '' },
    year: { type: Number, required: true },
    leaveType: { type: String, enum: LEAVE_TYPES, required: true },

    entitled: { type: Number, min: 0, default: 0 },
    taken: { type: Number, min: 0, default: 0 },

    source: { type: String, enum: ['manual', 'hrms'], default: 'manual' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

leaveBalanceSchema.virtual('balance').get(function balance() {
  return Math.max(0, (this.entitled || 0) - (this.taken || 0));
});

leaveBalanceSchema.index({ user: 1, year: 1, leaveType: 1 }, { unique: true });

export default mongoose.model('LeaveBalance', leaveBalanceSchema);
