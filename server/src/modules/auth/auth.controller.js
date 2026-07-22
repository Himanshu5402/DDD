import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';
import { isProd } from '../../config/env.js';
import { getTokenExpiry } from '../../services/token.service.js';
import { auditFromRequest } from '../../services/audit.service.js';
import { AUDIT_ACTIONS, MODULES } from '../../config/constants.js';
import * as authService from './auth.service.js';

const REFRESH_COOKIE = 'refreshToken';

function setRefreshCookie(res, refreshToken) {
  const expires = getTokenExpiry(refreshToken) ?? undefined;
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    expires,
    path: '/',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

const readRefreshToken = (req) => req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];

// Registration is disabled (owner-only console) — the route answers 410 Gone
// directly in auth.routes.js.

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({
    email,
    password,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  setRefreshCookie(res, result.refreshToken);
  auditFromRequest(req, {
    actor: result.user._id,
    actorEmail: result.user.email,
    action: AUDIT_ACTIONS.LOGIN,
    module: MODULES.USERS,
    description: `${result.user.email} logged in`,
  });

  return ApiResponse.ok(
    res,
    {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
    'Login successful'
  );
});

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) throw ApiError.unauthorized('No refresh token provided');

  const result = await authService.refresh({
    refreshToken,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  setRefreshCookie(res, result.refreshToken);
  return ApiResponse.ok(
    res,
    { accessToken: result.accessToken, refreshToken: result.refreshToken },
    'Token refreshed'
  );
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req);
  await authService.logout({ refreshToken });
  clearRefreshCookie(res);
  if (req.user) {
    auditFromRequest(req, {
      action: AUDIT_ACTIONS.LOGOUT,
      module: MODULES.USERS,
      description: `${req.user.email} logged out`,
    });
  }
  return ApiResponse.ok(res, null, 'Logged out');
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user._id);
  clearRefreshCookie(res);
  return ApiResponse.ok(res, null, 'Logged out from all devices');
});

export const me = asyncHandler(async (req, res) => {
  const profile = await authService.getProfile(req.user._id);
  return ApiResponse.ok(
    res,
    { user: profile.user, permissions: profile.permissions, isSuperAdmin: profile.isSuperAdmin },
    'OK'
  );
});
