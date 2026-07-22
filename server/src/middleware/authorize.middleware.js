import ApiError from '../utils/ApiError.js';

/**
 * RBAC removed — DDD is an owner-only console. `authorize()` is kept as a
 * no-op passthrough so the ~20 route files that call
 * `authorize(MODULES.X, ACTIONS.Y)` keep working untouched. It still requires
 * `authenticate` to have run (defense-in-depth if a route ever drops it).
 *
 *   router.get('/', authenticate, authorize(MODULES.USERS, ACTIONS.READ), handler)
 */
export default function authorize(_module, _action) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    return next();
  };
}

/** RBAC removed — same no-op passthrough as `authorize()` (shape kept). */
export function authorizeAll(_pairs) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    return next();
  };
}
