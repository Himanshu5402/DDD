import crypto from 'node:crypto';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/**
 * Guards machine-to-machine integration routes with the shared
 * `x-api-key: <INTEGRATION_API_KEY>` header (same value in the HRMS .env).
 *
 * - 503 when the key is not configured on this server (integration disabled).
 * - 401 on a missing/wrong key — compared timing-safe so the check does not
 *   leak key material through response timing.
 *
 * These routes are mounted WITHOUT `authenticate` (no JWT): the caller is the
 * HRMS backend, not a logged-in user.
 */
export default function requireApiKey(req, _res, next) {
  const configured = env.INTEGRATION_API_KEY;
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
}
