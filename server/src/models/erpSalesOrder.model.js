import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ERP_SALES_ORDER_STATUSES = Object.freeze(['open', 'partial', 'completed']);

/**
 * A sales order mirrored from itsybizz-ERP, keyed on externalId = the ERP
 * Mongo _id (orderNo SO-#### is display only). Deliveries reference the
 * dispatched finished goods by their ERP _ids.
 */
const erpSalesOrderSchema = new Schema(
  {
    orderNo: { type: String, trim: true, default: '', index: true },
    customerExternalId: { type: String, trim: true, default: '' },
    customerName: { type: String, trim: true, default: '' },

    productCode: { type: String, trim: true, default: '' },
    productName: { type: String, trim: true, default: '' },
    orderedQty: { type: Number, min: 0, default: 0 },
    deliveredQty: { type: Number, min: 0, default: 0 },

    status: {
      type: String,
      enum: ERP_SALES_ORDER_STATUSES,
      default: 'open',
      index: true,
    },
    orderDate: { type: Date, default: null },
    notes: { type: String, trim: true, default: '' },

    deliveries: [
      {
        _id: false,
        qty: { type: Number, min: 0, default: 0 },
        date: { type: Date, default: null },
        finishedGoodExternalIds: [{ type: String, trim: true }],
      },
    ],

    source: { type: String, enum: ['erp'], default: 'erp' },
    externalId: { type: String, trim: true, unique: true, sparse: true },
    lastSyncedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('ErpSalesOrder', erpSalesOrderSchema);
