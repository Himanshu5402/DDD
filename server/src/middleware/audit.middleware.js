import { auditFromRequest } from '../services/audit.service.js';

/**
 * Middleware factory that records an audit entry after a successful
 * (2xx/3xx) response. Attach to mutating routes:
 *
 *   router.post('/', auditAction({ action: 'create', module: MODULES.USERS,
 *     entityType: 'User', describe: (req, res) => `Created user ${req.body.email}` }),
 *     handler)
 *
 * `describe` and `entityId` may be functions of (req, res) evaluated post-response.
 */
export default function auditAction({ action, module, entityType, entityId, describe } = {}) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return; // only record successful mutations
      const resolve = (v) => (typeof v === 'function' ? safe(() => v(req, res)) : v);
      auditFromRequest(req, {
        action,
        module,
        entityType,
        entityId: resolve(entityId),
        description: resolve(describe) ?? '',
        metadata: { method: req.method, path: req.originalUrl, status: res.statusCode },
      });
    });
    next();
  };
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
