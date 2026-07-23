import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ERP_BOM_STATUSES = Object.freeze(['active', 'inactive']);

/**
 * A bill of materials mirrored from itsybizz-ERP, keyed on externalId = the
 * ERP Mongo _id. Costing fields arrive pre-computed by the ERP's own
 * pre-validate hook — DDD never recalculates them.
 */
const erpBomSchema = new Schema(
  {
    productName: { type: String, trim: true, default: '' },
    productCode: { type: String, trim: true, uppercase: true, default: '' },
    outputQuantity: { type: Number, min: 0, default: 1 },

    materials: [
      {
        _id: false,
        materialType: { type: String, trim: true, default: '' },
        quantity: { type: Number, min: 0, default: 1 },
        unitCost: { type: Number, min: 0, default: 0 },
        notes: { type: String, trim: true, default: '' },
      },
    ],
    processes: [
      {
        _id: false,
        name: { type: String, trim: true, default: '' },
        description: { type: String, trim: true, default: '' },
        cost: { type: Number, min: 0, default: 0 },
      },
    ],

    materialCost: { type: Number, min: 0, default: 0 },
    processCost: { type: Number, min: 0, default: 0 },
    totalCost: { type: Number, min: 0, default: 0 },
    costPerUnit: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: ERP_BOM_STATUSES, default: 'active' },
    remarks: { type: String, trim: true, default: '' },

    source: { type: String, enum: ['erp'], default: 'erp' },
    externalId: { type: String, trim: true, unique: true, sparse: true },
    lastSyncedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('ErpBom', erpBomSchema);
