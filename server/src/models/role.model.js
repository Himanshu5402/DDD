import mongoose from 'mongoose';

/**
 * A named bundle of permissions. Users are assigned one or more roles;
 * their effective permission set is the union across all roles.
 *
 * `isSuperAdmin` roles bypass permission checks entirely (full access).
 */
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
    isSystem: { type: Boolean, default: false }, // system roles can't be deleted
    isSuperAdmin: { type: Boolean, default: false }, // bypasses all permission checks
    level: { type: Number, default: 0 }, // higher = more privileged (for UI ordering / hierarchy)
  },
  { timestamps: true }
);

export default mongoose.model('Role', roleSchema);
