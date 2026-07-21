import Permission from '../models/permission.model.js';
import Role from '../models/role.model.js';
import User from '../models/user.model.js';
import Company from '../models/company.model.js';
import { MODULE_LIST, ACTION_LIST, MODULES, ACTIONS, SYSTEM_ROLES } from '../config/constants.js';
import env from '../config/env.js';
import logger from '../config/logger.js';

/** Upsert the full module × action permission matrix. Returns key → _id map. */
export async function seedPermissions() {
  const map = new Map();
  for (const module of MODULE_LIST) {
    for (const action of ACTION_LIST) {
      const key = `${module}:${action}`;
      const doc = await Permission.findOneAndUpdate(
        { key },
        {
          $setOnInsert: {
            module,
            action,
            key,
            description: `${action} on ${module}`,
            isSystem: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      map.set(key, doc._id);
    }
  }
  return map;
}

const keysFor = (permMap, modules, actions) => {
  const ids = [];
  for (const m of modules) {
    for (const a of actions) {
      const id = permMap.get(`${m}:${a}`);
      if (id) ids.push(id);
    }
  }
  return ids;
};

/** Upsert the built-in system roles with sensible permission sets. */
export async function seedRoles(permMap) {
  const allIds = [...permMap.values()];
  const operationalModules = [
    MODULES.GOALS,
    MODULES.TASKS,
    MODULES.RRRMAS,
    MODULES.EVENING_REPORTING,
    MODULES.DASHBOARD,
    MODULES.AI,
  ];

  const definitions = [
    {
      slug: SYSTEM_ROLES.SUPER_ADMIN,
      name: 'Super Admin',
      description: 'Full, unrestricted access to every module.',
      isSystem: true,
      isSuperAdmin: true,
      level: 100,
      permissions: allIds,
    },
    {
      slug: SYSTEM_ROLES.ADMIN,
      name: 'Administrator',
      description: 'Manage all modules and users.',
      isSystem: true,
      isSuperAdmin: false,
      level: 80,
      permissions: allIds,
    },
    {
      slug: SYSTEM_ROLES.MANAGER,
      name: 'Manager',
      description: 'Operate day-to-day modules and view analytics.',
      isSystem: true,
      level: 50,
      permissions: [
        ...keysFor(permMap, operationalModules, [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE]),
        ...keysFor(
          permMap,
          [
            MODULES.FINANCE,
            MODULES.EMPLOYEE_ANALYTICS,
            MODULES.MAINTENANCE,
            MODULES.PRODUCTS,
            MODULES.LEAVE,
            MODULES.RECRUITMENT,
            MODULES.PAYROLL,
          ],
          [ACTIONS.READ]
        ),
      ],
    },
    {
      slug: SYSTEM_ROLES.EMPLOYEE,
      name: 'Employee',
      description: 'Self-service access to own tasks, goals and reports.',
      isSystem: true,
      level: 10,
      permissions: [
        ...keysFor(permMap, [MODULES.DASHBOARD, MODULES.GOALS, MODULES.TASKS], [ACTIONS.READ]),
        ...keysFor(permMap, [MODULES.EVENING_REPORTING], [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE]),
        ...keysFor(permMap, [MODULES.AI], [ACTIONS.READ]),
      ],
    },
  ];

  const roleMap = new Map();
  for (const def of definitions) {
    const role = await Role.findOneAndUpdate(
      { slug: def.slug },
      { $set: def },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    roleMap.set(def.slug, role);
  }
  return roleMap;
}

/** Create the seed admin user (idempotent) assigned the super_admin role. */
export async function seedAdmin(roleMap) {
  const existing = await User.findOne({ email: env.SEED_ADMIN_EMAIL });
  if (existing) return existing;

  const superAdmin = roleMap.get(SYSTEM_ROLES.SUPER_ADMIN);
  const user = new User({
    name: env.SEED_ADMIN_NAME,
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD, // hashed by pre-save hook
    roles: [superAdmin._id],
    isActive: true,
  });
  await user.save();
  logger.info(`Seeded admin user: ${user.email}`);
  return user;
}

/** Upsert the owner's companies (idempotent by code). */
export async function seedCompanies(adminId) {
  const companies = [
    { code: 'DNS', name: 'Deepnapsoftech', color: '#4f46e5', description: 'Software development & services' },
    { code: 'IBZ', name: 'Itsybizz AI Private Limited', color: '#0ea5e9', description: 'AI products & industrial automation' },
    { code: 'DRY', name: 'Dryish ERCS', color: '#16a34a', description: 'ERCS business' },
  ];
  const result = [];
  for (const c of companies) {
    const doc = await Company.findOneAndUpdate(
      { code: c.code },
      { $set: { name: c.name, color: c.color, description: c.description, isActive: true }, $setOnInsert: { createdBy: adminId ?? null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    result.push(doc);
  }
  return result;
}

/** Run the full core seed (permissions → roles → admin → companies). Idempotent. */
export async function seedAll() {
  const permMap = await seedPermissions();
  const roleMap = await seedRoles(permMap);
  const admin = await seedAdmin(roleMap);
  const companies = await seedCompanies(admin._id);
  return { permissions: permMap.size, roles: roleMap.size, adminEmail: admin.email, companies: companies.length };
}
