import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../services/token.service.js';

/**
 * Authenticates a request via `Authorization: Bearer <accessToken>`.
 *
 * DDD is an owner-only console (RBAC removed): anyone who can log in IS the
 * owner. On success attaches:
 *   req.user           — the User document (roles populated for legacy reads)
 *   req.permissions    — Set(['*']) (wildcard — kept for shape compat)
 *   req.isSuperAdmin   — always true
 */
export default async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing or malformed Authorization header');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired access token', { code: 'TOKEN_EXPIRED' });
    }

    const user = await User.findById(payload.sub).populate({
      path: 'roles',
      populate: { path: 'permissions' },
    });
    if (!user) throw ApiError.unauthorized('User no longer exists');
    if (!user.isActive) throw ApiError.forbidden('Account is disabled');

    // Reject access tokens issued before the user's last password change so a
    // reset/change immediately invalidates outstanding tokens (paired with
    // session revocation on the refresh side).
    if (user.passwordChangedAt && payload.iat) {
      const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (payload.iat < changedAtSec) {
        throw ApiError.unauthorized('Session invalidated by password change', {
          code: 'TOKEN_EXPIRED',
        });
      }
    }

    // Owner-only console: every authenticated user acts with full authority.
    req.user = user;
    req.permissions = new Set(['*']);
    req.isSuperAdmin = true;
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth — attaches req.user if a valid token is present, else continues. */
export async function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, (err) => (err ? next() : next()));
}
