import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Recurring bills / recharges / subscriptions that expire and need renewing —
 * light bills, WiFi & mobile recharges, domains, software licences, insurance,
 * rent, etc. Unlike an Asset (a physical thing), an ExpiryItem is a *deadline*:
 * something the team must renew before `dueDate` or it lapses. The reminder
 * sweep (services/maintenance/expiry.scheduler.js) watches these and notifies
 * admins as the due date approaches ("1 day left").
 */
export const EXPIRY_CATEGORIES = Object.freeze([
  'utility', // electricity / water / gas bills
  'internet', // WiFi / broadband
  'mobile', // mobile recharge / postpaid
  'software', // SaaS subscriptions
  'license', // licences / certifications
  'domain', // domains / hosting / SSL
  'insurance',
  'rent',
  'subscription',
  'other',
]);

export const EXPIRY_RECURRENCES = Object.freeze([
  'none',
  'weekly',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
]);

export const EXPIRY_STATUSES = Object.freeze([
  'active', // being tracked; eligible for reminders
  'paid', // settled / renewed and not recurring — no longer chased
  'cancelled', // stopped tracking
]);

// Reminder stages, fired at most once each per due-date cycle.
export const REMINDER_STAGES = Object.freeze(['upcoming', 'due_soon', 'due', 'overdue']);

const expiryItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    category: { type: String, enum: EXPIRY_CATEGORIES, default: 'other', index: true },

    // Vendor / biller (e.g. "Airtel", "BSES", "Jio", "GoDaddy").
    provider: { type: String, default: '', trim: true },

    // Optional account / consumer / connection number for reference.
    accountRef: { type: String, default: '', trim: true },

    amount: { type: Number, min: 0, default: 0 },

    // The expiry / renewal deadline this item is counting down to.
    dueDate: { type: Date, required: true, index: true },

    recurrence: { type: String, enum: EXPIRY_RECURRENCES, default: 'monthly' },

    status: { type: String, enum: EXPIRY_STATUSES, default: 'active', index: true },

    // Start nudging admins this many days before dueDate (in addition to the
    // fixed 1-day / due-day / overdue nudges).
    reminderDaysBefore: { type: Number, min: 0, max: 90, default: 3 },

    // Which reminder stages have already been sent for the *current* dueDate.
    // Reset to [] whenever dueDate changes or the item is renewed.
    remindersSent: { type: [String], default: [] },
    lastRemindedAt: { type: Date, default: null },

    // Person responsible for renewing (also notified alongside admins).
    owner: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    notes: { type: String, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Reminder sweep + "expiring soon" queries.
expiryItemSchema.index({ status: 1, dueDate: 1 });

/** Whole calendar days from today until dueDate (negative once overdue). */
expiryItemSchema.virtual('daysLeft').get(function daysLeft() {
  if (!this.dueDate) return null;
  const due = new Date(this.dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
});

export default mongoose.model('ExpiryItem', expiryItemSchema);
