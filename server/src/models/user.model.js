import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

// HR master enums (single source of truth; mirrored by the HRMS sync + client).
export const EMPLOYMENT_TYPES = Object.freeze(['full_time', 'part_time', 'contract', 'intern', 'consultant']);
export const EMPLOYMENT_STATUSES = Object.freeze(['active', 'on_notice', 'on_leave', 'suspended', 'exited']);
export const WORK_MODES = Object.freeze(['office', 'remote', 'hybrid']);
// HRMS access level → drives the DDD role mapping during sync.
export const HRMS_ACCESS_LEVELS = Object.freeze(['hr_admin', 'manager', 'employee']);

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

    // HRMS integration: employees sync from the company HRMS by hrmsId
    // (idempotent upserts), same read-only-mirror pattern as the PEPSI project sync.
    source: { type: String, enum: ['manual', 'hrms'], default: 'manual' },
    hrmsId: { type: String, unique: true, sparse: true, trim: true },
    employeeCode: { type: String, trim: true, default: '' },
    // The HRMS access level this employee holds, kept for reference/auditing of
    // the access → DDD role mapping applied at sync time.
    accessLevel: { type: String, enum: HRMS_ACCESS_LEVELS, default: undefined },

    // HR master data (mirrored from HRMS; owner/manager dashboards read these).
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: undefined },
    employmentStatus: { type: String, enum: EMPLOYMENT_STATUSES, default: 'active', index: true },
    dateOfJoining: { type: Date, default: null },
    dateOfExit: { type: Date, default: null },
    probationEndDate: { type: Date, default: null },
    workMode: { type: String, enum: WORK_MODES, default: undefined },
    workLocation: { type: String, trim: true, default: '' },
    dateOfBirth: { type: Date, default: null },

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
