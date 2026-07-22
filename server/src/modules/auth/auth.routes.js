import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import { authLimiter } from '../../middleware/rateLimit.middleware.js';
import { loginSchema, refreshSchema } from './auth.validation.js';
import ApiError from '../../utils/ApiError.js';
import * as controller from './auth.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication & session management
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Disabled — DDD is an owner-only console (410 Gone)
 *     responses:
 *       410: { description: Registration is disabled }
 */
router.post('/register', authLimiter, (_req, _res, next) =>
  next(
    new ApiError(410, 'Registration is disabled — DDD is an owner-only console', {
      code: 'REGISTRATION_DISABLED',
    })
  )
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive access + refresh tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful }
 *       401: { description: Invalid credentials }
 */
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate the refresh token and get a new access token
 *     responses:
 *       200: { description: Token refreshed }
 *       401: { description: Invalid/expired refresh token }
 */
router.post('/refresh', validate({ body: refreshSchema }), controller.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out the current session
 *     responses:
 *       200: { description: Logged out }
 */
router.post('/logout', controller.logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Log out of all sessions/devices
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Logged out everywhere }
 */
router.post('/logout-all', authenticate, controller.logoutAll);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current user with roles & effective permissions
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Unauthenticated }
 */
router.get('/me', authenticate, controller.me);

export default router;
