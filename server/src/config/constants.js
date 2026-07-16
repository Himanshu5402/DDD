/**
 * System-wide constants: the module catalog and permission actions that
 * power RBAC. Every business module registers itself here so that roles can
 * be granted module-level, action-level permissions consistently.
 */

// The 10 product modules + the foundation modules that support them.
export const MODULES = Object.freeze({
  // Foundation
  USERS: 'users',
  ROLES: 'roles',
  AUDIT: 'audit',
  CUSTOM_FIELDS: 'custom_fields',
  COMPANIES: 'companies',
  // Product modules (built incrementally)
  GOALS: 'goals',
  TASKS: 'tasks',
  RRRMAS: 'rrrmas',
  PRODUCTS: 'products',
  FINANCE: 'finance',
  MAINTENANCE: 'maintenance',
  EMPLOYEE_ANALYTICS: 'employee_analytics',
  EVENING_REPORTING: 'evening_reporting',
  AI: 'ai',
  DASHBOARD: 'dashboard',
});

export const MODULE_LIST = Object.freeze(Object.values(MODULES));

// Standard CRUD-ish actions a permission can grant on a module.
export const ACTIONS = Object.freeze({
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  MANAGE: 'manage', // wildcard: implies all actions on the module
});

export const ACTION_LIST = Object.freeze(Object.values(ACTIONS));

// Built-in system roles created by the seeder.
export const SYSTEM_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
});

// Audit action verbs (kept open-ended; these are the common ones).
export const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  LOGIN_FAILED: 'auth.login_failed',
  TOKEN_REFRESH: 'auth.token_refresh',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  READ: 'read',
});

export const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});
