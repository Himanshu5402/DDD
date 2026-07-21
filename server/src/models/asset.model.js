import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ASSET_STATUSES = Object.freeze([
  'operational',
  'under_maintenance',
  'breakdown',
  'retired',
]);

const amcSchema = new Schema(
  {
    provider: { type: String, default: '' },
    validUntil: { type: Date },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const assetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    // Asset tag / QR code value (e.g. printed label on the machine).
    code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },

    // Cross-module link (loose coupling via ref; modules built separately).
    product: { type: Schema.Types.ObjectId, ref: 'Product', default: null },

    category: { type: String, default: 'general' },
    location: { type: String, default: '' },

    // Org unit + physical placement for IT inventory.
    department: { type: String, default: '', trim: true, index: true },
    room: { type: String, default: '', trim: true },

    // Setup grouping: all components of one workstation share a setupNumber
    // (e.g. "06" → CPU-06, MON-06, MOU-06, KEY-06). Assigning any component
    // assigns the whole setup to the same employee (see assignSetup()).
    setupNumber: { type: String, default: '', trim: true, index: true },

    status: { type: String, enum: ASSET_STATUSES, default: 'operational', index: true },

    purchaseDate: { type: Date },
    purchaseCost: { type: Number, min: 0 },
    warrantyUntil: { type: Date },

    // Annual Maintenance Contract details.
    amc: { type: amcSchema, default: () => ({}) },

    // Free-form key/value specifications (e.g. { cpu: 'i7', ram: '16GB' }).
    specs: { type: Schema.Types.Mixed, default: {} },

    // Dynamic admin-defined fields (entityType 'asset').
    customFields: { type: Schema.Types.Mixed, default: {} },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Value encoded into the asset's QR label.
assetSchema.virtual('qrPayload').get(function qrPayload() {
  return `asset:${this.code || this._id}`;
});

export default mongoose.model('Asset', assetSchema);
