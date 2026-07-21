import mongoose from 'mongoose';
import { LEAVE_TYPES } from './employeeRecord.model.js';

const { Schema } = mongoose;

export { LEAVE_TYPES };
export const LEAVE_REQUEST_STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'cancelled']);

/**
 * A leave application, mirrored from the HRMS (source 'hrms', upserted on
 * externalId) or created manually. Powers the owner "who's out" + pending-
 * approvals views. Read-only when source === 'hrms'.
 */
const leaveRequestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hrmsId: { type: String, trim: true, default: '', index: true },

    leaveType: { type: String, enum: LEAVE_TYPES, required: true },
    fromDate: { type: Date, required: true, index: true },
    toDate: { type: Date, required: true },
    days: { type: Number, min: 0.5, required: true },
    status: { type: String, enum: LEAVE_REQUEST_STATUSES, default: 'pending', index: true },

    approver: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, default: '' },
    appliedAt: { type: Date, default: Date.now },

    source: { type: String, enum: ['manual', 'hrms'], default: 'manual', index: true },
    externalId: { type: String, trim: true, unique: true, sparse: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('LeaveRequest', leaveRequestSchema);
