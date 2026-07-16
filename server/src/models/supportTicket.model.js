import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TICKET_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);
export const TICKET_STATUSES = Object.freeze([
  'open',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
]);

const commentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const slaSchema = new Schema(
  {
    dueAt: { type: Date },
    breached: { type: Boolean, default: false },
  },
  { _id: false }
);

const supportTicketSchema = new Schema(
  {
    subject: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Loose cross-module link by ref name only (module built separately).
    customer: { type: Schema.Types.ObjectId, ref: 'Contact', default: null, index: true },

    priority: { type: String, enum: TICKET_PRIORITIES, default: 'medium', index: true },
    status: { type: String, enum: TICKET_STATUSES, default: 'open', index: true },

    sla: { type: slaSchema, default: () => ({ breached: false }) },

    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    comments: [commentSchema],

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

supportTicketSchema.index({ subject: 'text', description: 'text' });

export default mongoose.model('SupportTicket', supportTicketSchema);
