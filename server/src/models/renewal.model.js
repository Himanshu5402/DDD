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

    // External lead reference (e.g. a Facebook / Google Ads lead id). Captured
    // once when the renewal is created and never editable afterwards — where the
    // lead was generated is immutable. `immutable` makes Mongoose ignore any later
    // change, so it stays hard-coded even if a stray update ever slips through.
    leadId: { type: String, trim: true, default: '', index: true, immutable: true },

    // Loose cross-module links by ref name only (modules built separately).
    customer: { type: Schema.Types.ObjectId, ref: 'Contact', default: null, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', default: null, index: true },

    amount: { type: Number, min: 0 },
    currency: { type: String, trim: true, default: 'INR' },

    dueDate: { type: Date, index: true },

    status: { type: String, enum: RENEWAL_STATUSES, default: 'upcoming', index: true },
    autoRenew: { type: Boolean, default: false },
    notes: { type: String, default: '' },

    // Optional per-row highlight colour chosen by the user in the Renewals list
    // (hex like '#3b82f6'; '' = none). Purely presentational.
    color: { type: String, trim: true, default: '' },

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
