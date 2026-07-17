import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, select: false },
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],

    isActive: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },

    avatar: { type: String, default: '' },
    phone: { type: String, default: '' },
    designation: { type: String, default: '' },
    department: { type: String, default: '' },

    // Which of the owner's companies this person works for.
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },

    // Org chart: this person's direct manager (null = top level).
    // A manager's team = User.find({ reportsTo: managerId }).
    reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // HRMS integration (future): employees sync from the company HRMS by
    // hrmsId (idempotent upserts), same pattern as the PEPSI project sync.
    source: { type: String, enum: ['manual', 'hrms'], default: 'manual' },
    hrmsId: { type: String, unique: true, sparse: true, trim: true },

    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },

    // Dynamic per-tenant custom fields (see the custom-fields engine).
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

// Hash the password whenever it is set/changed.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/**
 * Resolve this user's effective permissions across all roles.
 * Returns { isSuperAdmin, permissions: Set<'module:action'> }.
 * Requires roles + roles.permissions to be populated (or populates them).
 */
userSchema.methods.getEffectivePermissions = async function getEffectivePermissions() {
  if (!this.populated('roles')) {
    await this.populate({ path: 'roles', populate: { path: 'permissions' } });
  }
  const permissions = new Set();
  let isSuperAdmin = false;
  for (const role of this.roles || []) {
    if (role.isSuperAdmin) isSuperAdmin = true;
    for (const perm of role.permissions || []) {
      if (perm?.key) permissions.add(perm.key);
    }
  }
  return { isSuperAdmin, permissions };
};

export default mongoose.model('User', userSchema);
