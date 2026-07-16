import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../services/token.service.js';

/**
 * Authenticates a request via `Authorization: Bearer <accessToken>`.
 * On success attaches:
 *   req.user           — the User document (roles + permissions populated)
 *   req.permissions    — Set<'module:action'> of effective permissions
 *   req.isSuperAdmin   — boolean
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

    const { isSuperAdmin, permissions } = await user.getEffectivePermissions();
    req.user = user;
    req.permissions = permissions;
    req.isSuperAdmin = isSuperAdmin;
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
