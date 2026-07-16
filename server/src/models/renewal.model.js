import mongoose from 'mongoose';

const { Schema } = mongoose;

export const RENEWAL_STATUSES = Object.freeze([
  'upcoming',
  'due',
  'renewed',
  'expired',
  'cancelled',
]);

const renewalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },

    // Loose cross-module links by ref name only (modules built separately).
    customer: { type: Schema.Types.ObjectId, ref: 'Contact', default: null, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', default: null, index: true },

    amount: { type: Number, min: 0 },
    currency: { type: String, trim: true, default: 'INR' },

    dueDate: { type: Date, index: true },

    status: { type: String, enum: RENEWAL_STATUSES, default: 'upcoming', index: true },
    autoRenew: { type: Boolean, default: false },
    notes: { type: String, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

renewalSchema.index({ status: 1, dueDate: 1 });

export default mongoose.model('Renewal', renewalSchema);
