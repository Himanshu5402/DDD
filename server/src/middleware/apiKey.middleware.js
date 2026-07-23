import crypto from 'node:crypto';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/**
 * Guards machine-to-machine integration routes with an
 * `x-api-key: <key>` header. Every source system has its OWN key
 * (INTEGRATION_API_KEY = HRMS, ERP_INTEGRATION_API_KEY = itsybizz-ERP,
 * PEPSI_INTEGRATION_API_KEY = PEPSI) so a leaked key compromises exactly
 * one integration and each can be rotated independently.
 *
 * - 503 when the key is not configured on this server (integration disabled).
 * - 401 on a missing/wrong key — compared timing-safe so the check does not
 *   leak key material through response timing.
 *
 * These routes are mounted WITHOUT `authenticate` (no JWT): the caller is a
 * peer backend, not a logged-in user.
 */
export function requireApiKeyFor(envVar) {
  return function requireApiKey(req, _res, next) {
    const configured = env[envVar];
    if (!configured) {
      return next(
        new ApiError(503, 'Integration API key not configured', { code: 'INTEGRATION_DISABLED' })
      );
    }

    const presented = String(req.headers['x-api-key'] || '');
    const a = Buffer.from(presented);
    const b = Buffer.from(String(configured));
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!valid) {
      return next(ApiError.unauthorized('Invalid API key', { code: 'INVALID_API_KEY' }));
    }
    return next();
  };
}

// Default export keeps the original HRMS behaviour for existing imports.
export default requireApiKeyFor('INTEGRATION_API_KEY');
