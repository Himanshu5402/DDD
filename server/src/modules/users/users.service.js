import User from '../../models/user.model.js';
import Role from '../../models/role.model.js';
import Company from '../../models/company.model.js';
import Session from '../../models/session.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

const POPULATE_ROLES = [
  { path: 'roles', select: 'name slug level isSuperAdmin' },
  { path: 'company', select: 'name code color' },
  { path: 'reportsTo', select: 'name email designation avatar' },
];

/**
 * Guard org-chart edits: reportsTo must not be self and must not create a
 * cycle (walking up the new manager's chain must never reach the target).
 */
async function assertValidReportsTo(targetId, managerId) {
  if (!managerId) return; // clearing the manager is always fine
  if (String(managerId) === String(targetId)) {
    throw ApiError.badRequest('A user cannot report to themselves');
  }
  const manager = await User.findById(managerId).select('_id reportsTo');
  if (!manager) throw ApiError.badRequest('Manager does not exist');

  let cursor = manager;
  for (let depth = 0; cursor?.reportsTo && depth < 50; depth += 1) {
    if (String(cursor.reportsTo) === String(targetId)) {
      throw ApiError.badRequest('This change would create a reporting cycle');
    }
    cursor = await User.findById(cursor.reportsTo).select('_id reportsTo');
  }
}

async function assertCompanyExists(companyId) {
  if (!companyId) return;
  const exists = await Company.findById(companyId);
  if (!exists) throw ApiError.badRequest('Company does not exist');
}

async function assertRolesExist(roleIds = []) {
  if (!roleIds.length) return [];
  const count = await Role.countDocuments({ _id: { $in: roleIds } });
  if (count !== roleIds.length) throw ApiError.badRequest('One or more roles do not exist');
  return roleIds;
}

/**
 * Guard role assignment against vertical privilege escalation.
 *   - A user may never change their own roles (prevents self-escalation).
 *   - Only a super admin may grant a role that carries isSuperAdmin.
 * `actor` = { id, isSuperAdmin } of the authenticated caller.
 */
async function assertCanAssignRoles(roleIds = [], actor, targetId) {
  if (!actor) throw ApiError.forbidden('Role assignment requires an authenticated actor');

  if (String(targetId) === String(actor.id)) {
    throw ApiError.forbidden('You cannot modify your own roles');
  }

  if (!actor.isSuperAdmin && roleIds.length) {
    const superCount = await Role.countDocuments({ _id: { $in: roleIds }, isSuperAdmin: true });
    if (superCount > 0) {
      throw ApiError.forbidden('Only a super admin can assign a super-admin role');
    }
  }
}

export async function listUsers(query) {
  const { page, limit, skip, sort } = parsePagination(query);
  const filter = {};

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { department: rx }];
  }
  if (query.role) filter.roles = query.role;
  if (query.company) filter.company = query.company;
  if (query.isActive !== undefined) filter.isActive = query.isActive;

  const [items, total] = await Promise.all([
    User.find(filter).populate(POPULATE_ROLES).sort(sort).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return { items, page, limit, total };
}

export async function getUser(id) {
  const user = await User.findById(id).populate(POPULATE_ROLES);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function createUser(data) {
  const exists = await User.findOne({ email: data.email });
  if (exists) throw ApiError.conflict('An account with that email already exists');
  await assertRolesExist(data.roles);
  await assertCompanyExists(data.company);

  const user = new User({
    name: data.name,
    email: data.email,
    password: data.password,
    roles: data.roles || [],
    phone: data.phone,
    designation: data.designation,
    department: data.department,
    company: data.company || null,
    mustChangePassword: data.mustChangePassword ?? true,
  });
  await user.save();
  return user.populate(POPULATE_ROLES);
}

export async function updateUser(id, data, actor) {
  if (data.roles !== undefined) {
    await assertRolesExist(data.roles);
    await assertCanAssignRoles(data.roles, actor, id);
  }
  if (data.company) await assertCompanyExists(data.company);
  if (data.reportsTo !== undefined) await assertValidReportsTo(id, data.reportsTo);

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  const fields = ['name', 'phone', 'designation', 'department', 'company', 'avatar', 'roles', 'customFields', 'reportsTo'];
  for (const f of fields) if (data[f] !== undefined) user[f] = data[f];
  await user.save();
  return user.populate(POPULATE_ROLES);
}

/** The authenticated user's direct reports (their team). */
export async function getMyTeam(userId) {
  return User.find({ reportsTo: userId, isActive: true })
    .select('name email avatar designation department company')
    .populate({ path: 'company', select: 'name code color' })
    .sort('name');
}

/**
 * The whole reporting tree: every active user with minimal directory fields.
 * The client groups by reportsTo to render the chart.
 */
export async function getOrgChart() {
  const users = await User.find({ isActive: true })
    .select('name email avatar designation department company reportsTo roles')
    .populate({ path: 'company', select: 'name code color' })
    .populate({ path: 'roles', select: 'name slug isSuperAdmin' })
    .sort('name');
  return users;
}

export async function setUserStatus(id, isActive, actingUserId) {
  if (String(id) === String(actingUserId) && !isActive) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  const user = await User.findByIdAndUpdate(id, { isActive }, { new: true }).populate(POPULATE_ROLES);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

// assignRoles removed — RBAC gone (owner-only console). Roles data itself is
// kept (seeds + notification lookups by role slug still use it).

export async function adminResetPassword(id, newPassword) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  user.password = newPassword; // hashed by pre-save hook (also bumps passwordChangedAt)
  user.mustChangePassword = true;
  await user.save();

  // Invalidate every existing session so any stolen refresh token dies with the
  // reset. Access tokens issued before passwordChangedAt are rejected by the
  // authenticate middleware (iat check).
  await Session.updateMany({ user: id, revokedAt: null }, { revokedAt: new Date() });

  return { success: true };
}

export async function deleteUser(id, actingUserId) {
  if (String(id) === String(actingUserId)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  const user = await User.findById(id).populate({ path: 'roles', select: 'isSuperAdmin' });
  if (!user) throw ApiError.notFound('User not found');

  // Guard: never delete the last remaining super admin.
  const isSuper = user.roles.some((r) => r.isSuperAdmin);
  if (isSuper) {
    const superRoleIds = await Role.find({ isSuperAdmin: true }).distinct('_id');
    const superCount = await User.countDocuments({ roles: { $in: superRoleIds } });
    if (superCount <= 1) throw ApiError.badRequest('Cannot delete the last super admin');
  }

  // Remove the deleted user's sessions so no refresh token survives the account.
  await Session.deleteMany({ user: id });
  await user.deleteOne();
  return { success: true };
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
