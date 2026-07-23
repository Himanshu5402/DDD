import mongoose from 'mongoose';

const { Schema } = mongoose;

export const CONTACT_TYPES = Object.freeze(['lead', 'customer', 'supplier']);
// System of origin for mirrored contacts (named sourceSystem because `source`
// already means the free-text lead source, e.g. "referral").
export const CONTACT_SOURCE_SYSTEMS = Object.freeze(['manual', 'erp', 'pepsi']);
export const CONTACT_STATUSES = Object.freeze([
  'new',
  'contacted',
  'qualified',
  'active',
  'inactive',
  'lost',
]);

const contactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: CONTACT_TYPES, default: 'lead', index: true },
    company: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },

    status: { type: String, enum: CONTACT_STATUSES, default: 'new', index: true },
    source: { type: String, trim: true, default: '' },

    // Integration mirror keys: which system owns this contact and its id there
    // (ERP supplier/customer Mongo _id, PEPSI CUST-xxx / OPP-xxxx). Unique
    // sparse so manual contacts without one coexist.
    sourceSystem: {
      type: String,
      enum: CONTACT_SOURCE_SYSTEMS,
      default: 'manual',
      index: true,
    },
    externalId: { type: String, trim: true, unique: true, sparse: true },

    owner: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    tags: [{ type: String, trim: true }],
    notes: { type: String, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Dynamic admin-defined fields (entityType 'contact').
    customFields: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

contactSchema.index({ name: 'text', company: 'text', email: 'text' });

export default mongoose.model('Contact', contactSchema);
