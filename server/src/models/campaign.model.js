import mongoose from 'mongoose';

const { Schema } = mongoose;

export const CAMPAIGN_CHANNELS = Object.freeze(['email', 'social', 'ads', 'event', 'other']);
export const CAMPAIGN_STATUSES = Object.freeze(['draft', 'active', 'paused', 'completed']);

const metricsSchema = new Schema(
  {
    reach: { type: Number, min: 0, default: 0 },
    leads: { type: Number, min: 0, default: 0 },
    conversions: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const campaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    channel: { type: String, enum: CAMPAIGN_CHANNELS, default: 'other', index: true },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },

    budget: { type: Number, min: 0 },
    startDate: { type: Date },
    endDate: { type: Date },

    metrics: { type: metricsSchema, default: () => ({}) },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

campaignSchema.index({ name: 'text' });

export default mongoose.model('Campaign', campaignSchema);
