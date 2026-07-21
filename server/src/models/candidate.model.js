import mongoose from 'mongoose';

const { Schema } = mongoose;

export const CANDIDATE_STAGES = Object.freeze([
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
  'dropped',
]);
// Stages that still count as "in the pipeline" (not a terminal outcome).
export const ACTIVE_CANDIDATE_STAGES = Object.freeze(['applied', 'screening', 'interview', 'offer']);

/**
 * A candidate moving through the hiring pipeline for a JobPosition, mirrored
 * from the HRMS/ATS. Time-to-hire = hired stageUpdatedAt − appliedAt.
 */
const candidateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },

    position: { type: Schema.Types.ObjectId, ref: 'JobPosition', required: true, index: true },
    stage: { type: String, enum: CANDIDATE_STAGES, default: 'applied', index: true },

    source: { type: String, trim: true, default: '' }, // referral / naukri / linkedin …
    appliedAt: { type: Date, default: Date.now },
    stageUpdatedAt: { type: Date, default: Date.now },
    expectedJoining: { type: Date, default: null },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    notes: { type: String, trim: true, default: '' },

    sourceSystem: { type: String, enum: ['manual', 'hrms'], default: 'manual', index: true },
    externalId: { type: String, trim: true, unique: true, sparse: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('Candidate', candidateSchema);
