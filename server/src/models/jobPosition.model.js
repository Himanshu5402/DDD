import mongoose from 'mongoose';

const { Schema } = mongoose;

export const POSITION_STATUSES = Object.freeze(['open', 'on_hold', 'closed', 'filled']);
export const POSITION_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

/**
 * An open (or historical) hiring requisition, mirrored from the HRMS/ATS.
 * The owner's hiring funnel counts candidates per stage against these.
 */
const jobPositionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    department: { type: String, trim: true, default: '' },
    company: { type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true },

    openings: { type: Number, min: 0, default: 1 },
    priority: { type: String, enum: POSITION_PRIORITIES, default: 'medium' },
    status: { type: String, enum: POSITION_STATUSES, default: 'open', index: true },

    openSince: { type: Date, default: Date.now },
    targetHireDate: { type: Date, default: null },
    hiringManager: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    description: { type: String, trim: true, default: '' },

    source: { type: String, enum: ['manual', 'hrms'], default: 'manual', index: true },
    externalId: { type: String, trim: true, unique: true, sparse: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('JobPosition', jobPositionSchema);
