import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ERP_RAW_MATERIAL_STATUSES = Object.freeze(['in_stock', 'consumed']);

/**
 * One raw-material UNIT mirrored from itsybizz-ERP (each physical unit is its
 * own ERP document with a unique barcode PREFIX+DDMMYY+NNN). Keyed on
 * externalId = the ERP Mongo _id; the barcode is display/lookup only because
 * ERP serial numbers are reused after deletes.
 */
const erpRawMaterialSchema = new Schema(
  {
    barcode: { type: String, trim: true, default: '', index: true },
    materialType: { type: String, trim: true, default: '' },
    prefix: { type: String, trim: true, default: '' },

    // Supplier link (ERP supplier _id) + ERP's own point-in-time snapshot
    // fields, which survive supplier edits/deletes on the ERP side.
    supplierExternalId: { type: String, trim: true, default: '' },
    supplierName: { type: String, trim: true, default: '' },
    supplierContact: { type: String, trim: true, default: '' },
    supplierAddress: { type: String, trim: true, default: '' },
    supplierSerial: { type: String, trim: true, default: '' },

    purchaseDate: { type: Date, default: null },
    model: { type: String, trim: true, default: '' },
    specification: { type: String, trim: true, default: '' },
    warranty: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
    // Points at the ERP host's /uploads — documents are not proxied into DDD.
    documentUrl: { type: String, trim: true, default: '' },

    status: {
      type: String,
      enum: ERP_RAW_MATERIAL_STATUSES,
      default: 'in_stock',
      index: true,
    },
    // ERP FinishedGood _id this unit was consumed into (when status=consumed).
    consumedInFgExternalId: { type: String, trim: true, default: '' },

    source: { type: String, enum: ['erp'], default: 'erp' },
    externalId: { type: String, trim: true, unique: true, sparse: true },
    lastSyncedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('ErpRawMaterial', erpRawMaterialSchema);
