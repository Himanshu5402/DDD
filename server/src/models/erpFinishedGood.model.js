import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ERP_FG_QC_STATUSES = Object.freeze(['pending', 'passed', 'failed']);
export const ERP_FG_STATUSES = Object.freeze(['in_stock', 'dispatched']);

/**
 * A finished good (production build) mirrored from itsybizz-ERP, keyed on
 * externalId = the ERP Mongo _id. Carries the consumed raw-material references
 * so the traceability chain survives locally when the ERP is down.
 */
const erpFinishedGoodSchema = new Schema(
  {
    barcode: { type: String, trim: true, default: '', index: true },
    productCode: { type: String, trim: true, default: '' },
    productName: { type: String, trim: true, default: '' },
    productionDate: { type: Date, default: null },

    qcStatus: { type: String, enum: ERP_FG_QC_STATUSES, default: 'pending', index: true },
    qcBy: { type: String, trim: true, default: '' },
    qcRemarks: { type: String, trim: true, default: '' },
    qcDate: { type: Date, default: null },

    status: { type: String, enum: ERP_FG_STATUSES, default: 'in_stock', index: true },
    customerName: { type: String, trim: true, default: '' },
    dispatchDate: { type: Date, default: null },
    salesOrderExternalId: { type: String, trim: true, default: '' },

    // Consumed units (ERP RawMaterial _ids + display fields).
    rawMaterials: [
      {
        _id: false,
        externalId: { type: String, trim: true, default: '' },
        barcode: { type: String, trim: true, default: '' },
        materialType: { type: String, trim: true, default: '' },
      },
    ],
    bomExternalId: { type: String, trim: true, default: '' },

    source: { type: String, enum: ['erp'], default: 'erp' },
    externalId: { type: String, trim: true, unique: true, sparse: true },
    lastSyncedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('ErpFinishedGood', erpFinishedGoodSchema);
