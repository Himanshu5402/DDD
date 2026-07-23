import mongoose from 'mongoose';

const { Schema } = mongoose;

// Built-in types; the set is open — admin-added types live in FinanceOption
// (kind 'type'), each carrying a direction ('in'|'out') for the accounting.
export const TRANSACTION_TYPES = Object.freeze(['income', 'expense']);
export const TRANSACTION_DIRECTIONS = Object.freeze(['in', 'out']);
export const PAYMENT_METHODS = Object.freeze(['cash', 'bank', 'upi', 'card', 'cheque', 'invoice', 'other']);
// Models a transaction can be loosely linked to ('' = no link).
export const LINKABLE_MODELS = Object.freeze(['', 'Contact', 'Project', 'Renewal', 'Asset', 'Product']);

const partySchema = new Schema(
  {
    name: { type: String, trim: true, default: '' },
    // Contact belongs to the RRRMAS module; linked by ref only (loose coupling).
    contact: { type: Schema.Types.ObjectId, ref: 'Contact', default: null },
  },
  { _id: false }
);

const linkedToSchema = new Schema(
  {
    model: { type: String, enum: LINKABLE_MODELS, default: '' },
    id: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const transactionSchema = new Schema(
  {
    // Open set: built-in income/expense + admin-added FinanceOption types.
    type: { type: String, required: true, trim: true, lowercase: true, index: true },
    // Denormalized from the type's option at save time — every aggregate
    // (summary, dashboard, budgets) branches on this, never on `type`.
    direction: { type: String, enum: TRANSACTION_DIRECTIONS, default: 'out', index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    date: { type: Date, required: true, default: Date.now, index: true },

    // Free-form category, e.g. salary, rent, software, hardware, travel, gst,
    // vendor_payment, customer_payment, advance, loan, other.
    category: { type: String, trim: true, default: 'uncategorized', index: true },

    description: { type: String, default: '' },
    // Open set: built-in PAYMENT_METHODS + admin-added FinanceOption methods.
    paymentMethod: { type: String, default: 'bank', trim: true, lowercase: true },

    // Reference / id for the payment: UPI id, bank UTR/IMPS ref, card auth ref,
    // cheque number, etc. Not applicable to cash — the form hides this field and
    // the service clears it whenever the method is 'cash'.
    paymentRef: { type: String, trim: true, default: '' },

    // Free-text label for a custom method — only meaningful when paymentMethod
    // is 'other' (e.g. "Razorpay link", "barter", "adjustment"). The service
    // clears it whenever the method is not 'other'.
    paymentMethodOther: { type: String, trim: true, default: '' },

    // Counterparty: free-text name, optionally linked to a CRM contact.
    party: { type: partySchema, default: () => ({}) },

    // Generic cross-module link (target modules are built separately).
    linkedTo: { type: linkedToSchema, default: () => ({}) },

    isRecurring: { type: Boolean, default: false },
    recurringNote: { type: String, default: '' },

    tags: [{ type: String, trim: true }],

    // Dynamic admin-defined fields (entityType 'transaction').
    customFields: { type: Schema.Types.Mixed, default: {} },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

transactionSchema.index({ type: 1, date: -1 });
transactionSchema.index({ category: 1, date: -1 });

export default mongoose.model('Transaction', transactionSchema);
