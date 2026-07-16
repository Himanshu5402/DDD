import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PRODUCT_CATEGORIES = Object.freeze([
  'process_automation',
  'mern',
  'sap',
  'abap',
  'blockchain',
  'ai',
  'robotics',
  'cameras',
  'conveyors',
  'iot',
  'scada',
  'plc',
  'sensors',
  'custom_hardware',
  'other',
]);
export const PRODUCT_STATUSES = Object.freeze(['development', 'active', 'deprecated']);
export const ROADMAP_STATUSES = Object.freeze(['planned', 'in_progress', 'released']);

const versionSchema = new Schema(
  {
    version: { type: String, required: true, trim: true },
    releasedAt: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
  },
  { _id: true }
);

const roadmapItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    plannedFor: { type: String, default: '', trim: true }, // e.g. 'Q4 2026'
    status: { type: String, enum: ROADMAP_STATUSES, default: 'planned' },
  },
  { _id: true }
);

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    description: { type: String, default: '' },

    category: { type: String, enum: PRODUCT_CATEGORIES, default: 'other', index: true },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'active', index: true },

    currentVersion: { type: String, default: '1.0.0' },
    versions: [versionSchema],

    docsUrl: { type: String, default: '' },
    trainingUrl: { type: String, default: '' },
    supportNotes: { type: String, default: '' },

    price: { type: Number, min: 0 },
    currency: { type: String, default: 'INR' },

    upgradeRoadmap: [roadmapItemSchema],

    tags: [{ type: String, trim: true }],

    // Dynamic admin-defined fields (entityType 'product').
    customFields: { type: Schema.Types.Mixed, default: {} },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.index({ name: 'text', description: 'text' });

export default mongoose.model('Product', productSchema);
