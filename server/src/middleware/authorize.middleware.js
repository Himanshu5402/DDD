import ApiError from '../utils/ApiError.js';
import { ACTIONS } from '../config/constants.js';

/**
 * RBAC guard. Requires the authenticated user to hold `module:action`
 * (or the module wildcard `module:manage`, or be a super admin).
 * Must run AFTER `authenticate`.
 *
 *   router.get('/', authenticate, authorize(MODULES.USERS, ACTIONS.READ), handler)
 */
export default function authorize(module, action) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (req.isSuperAdmin) return next();

    const perms = req.permissions || new Set();
    if (perms.has(`${module}:${action}`) || perms.has(`${module}:${ACTIONS.MANAGE}`)) {
      return next();
    }
    return next(
      ApiError.forbidden(`Missing permission: ${module}:${action}`, {
        code: 'INSUFFICIENT_PERMISSIONS',
      })
    );
  };
}

/** Require ALL of the given [module, action] permission pairs. */
export function authorizeAll(pairs) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (req.isSuperAdmin) return next();
    const perms = req.permissions || new Set();
    const ok = pairs.every(
      ([m, a]) => perms.has(`${m}:${a}`) || perms.has(`${m}:${ACTIONS.MANAGE}`)
    );
    if (ok) return next();
    return next(ApiError.forbidden('Insufficient permissions', { code: 'INSUFFICIENT_PERMISSIONS' }));
  };
}
