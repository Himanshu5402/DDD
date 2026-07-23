import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ERP_USER_STATUSES = Object.freeze(['active', 'inactive']);

/**
 * An itsybizz-ERP login account mirrored into DDD, keyed on externalId = the
 * ERP Mongo _id. ERP users are a separate id-space from DDD/HRMS people —
 * they never become DDD User rows and passwords never land here.
 */
const erpUserSchema = new Schema(
  {
    name: { type: String, trim: true, default: '' },
    username: { type: String, trim: true, lowercase: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    // Free text on the ERP side (Admin/Manager/Store Keeper/Production/
    // Quality Check/Sales & Dispatch by convention).
    role: { type: String, trim: true, default: '' },
    status: { type: String, enum: ERP_USER_STATUSES, default: 'active' },

    source: { type: String, enum: ['erp'], default: 'erp' },
    externalId: { type: String, trim: true, unique: true, sparse: true },
    lastSyncedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('ErpUser', erpUserSchema);
