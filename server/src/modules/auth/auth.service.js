import User from '../../models/user.model.js';
import Role from '../../models/role.model.js';
import Session from '../../models/session.model.js';
import ApiError from '../../utils/ApiError.js';
import { SYSTEM_ROLES } from '../../config/constants.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  getTokenExpiry,
} from '../../services/token.service.js';

/** Issue a fresh access+refresh pair and persist the session. */
async function issueTokens(user, { ip, userAgent } = {}) {
  const session = await Session.create({
    user: user._id,
    tokenHash: 'pending',
    ip,
    userAgent,
    expiresAt: new Date(Date.now() + 60 * 1000), // temporary; corrected below
  });

  const refreshToken = signRefreshToken(user, session._id);
  session.tokenHash = hashToken(refreshToken);
  session.expiresAt = getTokenExpiry(refreshToken) ?? session.expiresAt;
  await session.save();

  const accessToken = signAccessToken(user);
  return { accessToken, refreshToken, session };
}

export async function register({ name, email, password }) {
  const exists = await User.findOne({ email });
  if (exists) throw ApiError.conflict('An account with that email already exists');

  // New self-registered users get the base "employee" role by default.
  const employeeRole = await Role.findOne({ slug: SYSTEM_ROLES.EMPLOYEE });

  const user = new User({
    name,
    email,
    password,
    roles: employeeRole ? [employeeRole._id] : [],
  });
  await user.save();
  return user;
}

export async function login({ email, password, ip, userAgent }) {
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('Account is disabled');

  const match = await user.comparePassword(password);
  if (!match) throw ApiError.unauthorized('Invalid email or password');

  const tokens = await issueTokens(user, { ip, userAgent });

  user.lastLoginAt = new Date();
  await user.save();

  return { user, ...tokens };
}

/**
 * Rotate a refresh token: validate it, revoke the old session, issue a new
 * session + token pair. Detects reuse of an already-rotated token.
 */
export async function refresh({ refreshToken, ip, userAgent }) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const session = await Session.findById(payload.sid);
  if (!session || session.tokenHash !== hashToken(refreshToken)) {
    throw ApiError.unauthorized('Refresh token not recognized');
  }
  if (!session.isActive()) {
    // Token was already rotated/revoked. Reject this single request without
    // cascading a revoke across the user's other sessions — a benign client
    // race or a second tab/device shouldn't log the user out everywhere.
    throw ApiError.unauthorized('Refresh token has been revoked');
  }

  const user = await User.findById(session.user);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account is no longer active');

  const tokens = await issueTokens(user, { ip, userAgent });

  session.revokedAt = new Date();
  session.replacedBy = tokens.session._id;
  await session.save();

  return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

/** Revoke the session tied to a specific refresh token (single-device logout). */
export async function logout({ refreshToken }) {
  if (!refreshToken) return;
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return; // already invalid — nothing to revoke
  }
  await Session.updateOne(
    { _id: payload.sid, revokedAt: null },
    { revokedAt: new Date() }
  );
}

/** Revoke every active session for a user ("log out everywhere"). */
export async function logoutAll(userId) {
  await Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}

/** Load a user with roles + effective permissions for the /me endpoint. */
export async function getProfile(userId) {
  const user = await User.findById(userId).populate({
    path: 'roles',
    populate: { path: 'permissions' },
  });
  if (!user) throw ApiError.notFound('User not found');
  const { isSuperAdmin, permissions } = await user.getEffectivePermissions();
  return { user, permissions: [...permissions], isSuperAdmin };
}
