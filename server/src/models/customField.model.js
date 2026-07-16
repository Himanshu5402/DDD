import mongoose from 'mongoose';

export const CUSTOM_FIELD_TYPES = Object.freeze([
  'text',
  'textarea',
  'number',
  'boolean',
  'date',
  'select',
  'multiselect',
  'email',
  'url',
]);

/**
 * Defines an admin-configurable custom field attached to a given entity type
 * (e.g. 'user', 'task', 'goal'). The dynamic-fields engine validates entity
 * `customFields` values against the active definitions for that entity type.
 */
const customFieldSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, index: true, lowercase: true, trim: true },
    key: { type: String, required: true, trim: true }, // stored key on the entity's customFields
    label: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: CUSTOM_FIELD_TYPES },

    required: { type: Boolean, default: false },
    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
    placeholder: { type: String, default: '' },
    helpText: { type: String, default: '' },

    // For select / multiselect: [{ label, value }]
    options: {
      type: [{ label: String, value: String, _id: false }],
      default: [],
    },

    // Optional validation rules by type.
    validation: {
      min: { type: Number },
      max: { type: Number },
      minLength: { type: Number },
      maxLength: { type: Number },
      pattern: { type: String }, // regex source
    },

    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

customFieldSchema.index({ entityType: 1, key: 1 }, { unique: true });

export default mongoose.model('CustomFieldDefinition', customFieldSchema);
