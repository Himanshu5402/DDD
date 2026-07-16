import mongoose from 'mongoose';

const { Schema } = mongoose;

export const BUDGET_PERIODS = Object.freeze(['monthly', 'quarterly', 'yearly']);

const budgetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Matches Transaction.category (free-form) so spend can be measured against it.
    category: { type: String, required: true, trim: true },
    period: { type: String, enum: BUDGET_PERIODS, default: 'monthly' },
    amount: { type: Number, required: true, min: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
    notes: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('Budget', budgetSchema);
