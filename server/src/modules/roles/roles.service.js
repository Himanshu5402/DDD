import Role from '../../models/role.model.js';
import Permission from '../../models/permission.model.js';
import User from '../../models/user.model.js';
import ApiError from '../../utils/ApiError.js';
import { parsePagination } from '../../utils/pagination.js';

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function assertPermissionsExist(ids = []) {
  if (!ids.length) return [];
  const count = await Permission.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) throw ApiError.badRequest('One or more permissions do not exist');
  return ids;
}

export async function listRoles(query) {
  const { page, limit, skip, sort } = parsePagination(query, { defaultLimit: 50 });
  const filter = {};
  if (query.search) filter.name = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [items, total] = await Promise.all([
    Role.find(filter).populate('permissions', 'key module action').sort(sort).skip(skip).limit(limit),
    Role.countDocuments(filter),
  ]);
  return { items, page, limit, total };
}

export async function getRole(id) {
  const role = await Role.findById(id).populate('permissions', 'key module action description');
  if (!role) throw ApiError.notFound('Role not found');
  return role;
}

export async function createRole(data) {
  const slug = data.slug ? slugify(data.slug) : slugify(data.name);
  if (!slug) throw ApiError.badRequest('A valid role name is required');

  const exists = await Role.findOne({ slug });
  if (exists) throw ApiError.conflict('A role with that name already exists');
  await assertPermissionsExist(data.permissions);

  const role = await Role.create({
    name: data.name,
    slug,
    description: data.description || '',
    permissions: data.permissions || [],
    level: data.level ?? 0,
    isSystem: false,
    isSuperAdmin: false,
  });
  return role.populate('permissions', 'key module action');
}

export async function updateRole(id, data) {
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound('Role not found');

  if (data.permissions) {
    await assertPermissionsExist(data.permissions);
    role.permissions = data.permissions;
  }
  if (data.name !== undefined) role.name = data.name;
  if (data.description !== undefined) role.description = data.description;
  // System roles keep their slug and privilege flags; only their permissions/description are editable freely.
  if (!role.isSystem) {
    if (data.slug !== undefined) role.slug = slugify(data.slug);
    if (data.level !== undefined) role.level = data.level;
  }

  await role.save();
  return role.populate('permissions', 'key module action');
}

export async function setRolePermissions(id, permissionIds) {
  await assertPermissionsExist(permissionIds);
  const role = await Role.findByIdAndUpdate(id, { permissions: permissionIds }, { new: true }).populate(
    'permissions',
    'key module action'
  );
  if (!role) throw ApiError.notFound('Role not found');
  return role;
}

export async function deleteRole(id) {
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound('Role not found');
  if (role.isSystem) throw ApiError.badRequest('System roles cannot be deleted');

  const inUse = await User.countDocuments({ roles: role._id });
  if (inUse > 0) {
    throw ApiError.badRequest(`Role is assigned to ${inUse} user(s); reassign them before deleting`);
  }
  await role.deleteOne();
  return { success: true };
}

/** Full permission catalog grouped by module — used by the role editor UI. */
export async function listPermissionCatalog() {
  const perms = await Permission.find().sort({ module: 1, action: 1 }).lean();
  const grouped = {};
  for (const p of perms) {
    (grouped[p.module] ||= []).push({ _id: p._id, key: p.key, action: p.action, description: p.description });
  }
  return grouped;
}
