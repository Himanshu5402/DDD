import { Router } from 'express';
import authenticate from '../../middleware/authenticate.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import { authLimiter } from '../../middleware/rateLimit.middleware.js';
import { registerSchema, loginSchema, refreshSchema } from './auth.validation.js';
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
 *     summary: Register a new user (assigned the Employee role)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: Registration successful }
 */
router.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);

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
