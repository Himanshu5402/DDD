import mongoose from 'mongoose';

const { Schema } = mongoose;

export const FINANCE_OPTION_KINDS = Object.freeze(['category', 'method', 'type']);
export const TYPE_DIRECTIONS = Object.freeze(['in', 'out']);

/**
 * Admin-managed finance dropdown options — transaction categories and payment
 * methods. Built-in defaults live in the finance service; rows here extend
 * them at runtime (added explicitly from the Finance page, or auto-registered
 * when a transaction is saved with an unknown category/method).
 *
 * For methods, `refLabel` customises the "Payment ID" field label shown in the
 * form (e.g. 'Payment ID — UPI ID'); an EMPTY refLabel means the method is
 * cash-like and carries no reference id (the field is hidden and cleared).
 */
const financeOptionSchema = new Schema(
  {
    kind: { type: String, enum: FINANCE_OPTION_KINDS, required: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    refLabel: { type: String, trim: true, default: 'Payment ID' },
    // Types only: whether transactions of this type count as money-in (like
    // income) or money-out (like expense) — drives every summary/aggregate.
    direction: { type: String, enum: TYPE_DIRECTIONS, default: 'out' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

financeOptionSchema.index({ kind: 1, key: 1 }, { unique: true });

export default mongoose.model('FinanceOption', financeOptionSchema);
