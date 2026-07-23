import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ERP_ASSET_STATUSES = Object.freeze(['available', 'assigned']);
export const ERP_ASSET_HISTORY_ACTIONS = Object.freeze(['assigned', 'returned']);

/**
 * A factory/office asset mirrored from itsybizz-ERP, keyed on externalId =
 * the ERP Mongo _id. Distinct from DDD's own Asset model (IT setups) — ERP
 * assets stay in their own mirror so neither list pollutes the other.
 */
const erpAssetSchema = new Schema(
  {
    name: { type: String, trim: true, default: '' },
    assetType: { type: String, trim: true, default: 'Other' },
    tag: { type: String, trim: true, default: '' },
    purchaseDate: { type: Date, default: null },
    purchasedBy: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },

    status: { type: String, enum: ERP_ASSET_STATUSES, default: 'available', index: true },
    currentHolder: { type: String, trim: true, default: '' },

    history: [
      {
        _id: false,
        action: { type: String, enum: ERP_ASSET_HISTORY_ACTIONS },
        person: { type: String, trim: true, default: '' },
        date: { type: Date, default: null },
        note: { type: String, trim: true, default: '' },
      },
    ],

    source: { type: String, enum: ['erp'], default: 'erp' },
    externalId: { type: String, trim: true, unique: true, sparse: true },
    lastSyncedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('ErpAsset', erpAssetSchema);
