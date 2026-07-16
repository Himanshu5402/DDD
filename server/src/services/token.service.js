import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { TOKEN_TYPES } from '../config/constants.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), type: TOKEN_TYPES.ACCESS }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

/** Sign a refresh token bound to a specific session id (sid) for rotation. */
export function signRefreshToken(user, sessionId) {
  return jwt.sign(
    { sub: String(user._id), sid: String(sessionId), type: TOKEN_TYPES.REFRESH },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (payload.type !== TOKEN_TYPES.ACCESS) throw new jwt.JsonWebTokenError('Wrong token type');
  return payload;
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (payload.type !== TOKEN_TYPES.REFRESH) throw new jwt.JsonWebTokenError('Wrong token type');
  return payload;
}

/** SHA-256 hash — refresh tokens are stored hashed in the Session collection. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Extract the expiry Date encoded in a signed JWT. */
export function getTokenExpiry(token) {
  const decoded = jwt.decode(token);
  return decoded?.exp ? new Date(decoded.exp * 1000) : null;
}
