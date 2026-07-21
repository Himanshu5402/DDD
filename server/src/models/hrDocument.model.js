import mongoose from 'mongoose';

const { Schema } = mongoose;

export const HR_DOCUMENT_TYPES = Object.freeze([
  'aadhaar',
  'pan',
  'passport',
  'visa',
  'contract',
  'offer_letter',
  'certification',
  'other',
]);

/**
 * A compliance document tied to an employee, mirrored from HRMS. Drives the
 * owner "documents expiring / probation due" compliance feed (same spirit as
 * the Maintenance expiry reminders). `status` is derived at read time from
 * expiresOn, so it is not persisted.
 */
const hrDocumentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hrmsId: { type: String, trim: true, default: '' },

    docType: { type: String, enum: HR_DOCUMENT_TYPES, default: 'other' },
    docNumber: { type: String, trim: true, default: '' },
    issuedOn: { type: Date, default: null },
    expiresOn: { type: Date, default: null, index: true },

    source: { type: String, enum: ['manual', 'hrms'], default: 'manual', index: true },
    externalId: { type: String, trim: true, unique: true, sparse: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('HrDocument', hrDocumentSchema);
