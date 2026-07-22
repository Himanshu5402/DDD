import User from '../../models/user.model.js';
import Session from '../../models/session.model.js';
import ApiError from '../../utils/ApiError.js';
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

// Self-registration is disabled: DDD is an owner-only console. The route
// returns 410 Gone (see auth.routes.js); accounts are created by the owner
// or mirrored from HRMS.

export async function login({ email, password, ip, userAgent }) {
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('Account is disabled');

  // HRMS-mirrored users and employees never log into DDD — this console is
  // owner-only. They use the HRMS portal instead.
  if (user.source === 'hrms' || user.accessLevel === 'employee') {
    throw ApiError.forbidden('Please use the HRMS portal', { code: 'USE_HRMS_PORTAL' });
  }

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

/**
 * Load the current user for the /me endpoint. RBAC removed: every
 * authenticated user is the owner, so permissions are the wildcard and
 * isSuperAdmin is always true (shape kept for client compat).
 */
export async function getProfile(userId) {
  const user = await User.findById(userId).populate({
    path: 'roles',
    populate: { path: 'permissions' },
  });
  if (!user) throw ApiError.notFound('User not found');
  return { user, permissions: ['*'], isSuperAdmin: true };
}
