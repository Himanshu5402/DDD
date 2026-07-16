import User from '../../models/user.model.js';
import Role from '../../models/role.model.js';
import Company from '../../models/company.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

const POPULATE_ROLES = [
  { path: 'roles', select: 'name slug level isSuperAdmin' },
  { path: 'company', select: 'name code color' },
];

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

export async function updateUser(id, data) {
  if (data.roles) await assertRolesExist(data.roles);
  if (data.company) await assertCompanyExists(data.company);

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  const fields = ['name', 'phone', 'designation', 'department', 'company', 'avatar', 'roles', 'customFields'];
  for (const f of fields) if (data[f] !== undefined) user[f] = data[f];
  await user.save();
  return user.populate(POPULATE_ROLES);
}

export async function setUserStatus(id, isActive, actingUserId) {
  if (String(id) === String(actingUserId) && !isActive) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  const user = await User.findByIdAndUpdate(id, { isActive }, { new: true }).populate(POPULATE_ROLES);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function assignRoles(id, roleIds) {
  await assertRolesExist(roleIds);
  const user = await User.findByIdAndUpdate(id, { roles: roleIds }, { new: true }).populate(
    POPULATE_ROLES
  );
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function adminResetPassword(id, newPassword) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  user.password = newPassword; // hashed by pre-save hook
  user.mustChangePassword = true;
  await user.save();
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

  await user.deleteOne();
  return { success: true };
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
