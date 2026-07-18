import mongoose from 'mongoose';

const { Schema } = mongoose;

export const NOTIFICATION_TYPES = Object.freeze([
  'task_assigned', // someone assigned you a task
  'task_delegated', // your manager delegated a task to you
  'task_completed', // a task you assigned/delegated/created was completed
  'task_commented', // someone commented on a task you participate in
  'report_submitted', // a report was submitted for your review
  'report_approved', // your report (or one you reviewed) was approved
  'report_rejected', // your report (or one you approved) was returned with a reason
  'expiry_due', // a bill/renewal is expiring soon (or overdue)
  'maintenance_due', // scheduled maintenance is due soon (or overdue)
  'generic',
]);

/**
 * Per-user notification feed item. Created by the notifications service,
 * delivered in real time via Socket.IO (`notification:new` to the recipient's
 * `user:<id>` room) and read back through GET /notifications.
 */
const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    type: { type: String, enum: NOTIFICATION_TYPES, default: 'generic' },
    message: { type: String, required: true, trim: true },

    // What the notification is about (loose ref — resolved by entityType).
    entityType: { type: String, default: '' }, // e.g. 'task'
    entityId: { type: Schema.Types.ObjectId, default: null },

    // Client-side route to open when clicked, e.g. '/tasks?task=<id>'.
    link: { type: String, default: '' },

    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

// Feed + unread-count queries.
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

export default mongoose.model('Notification', notificationSchema);
