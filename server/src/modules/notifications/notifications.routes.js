import { Router } from 'express';
import { z } from 'zod';
import authenticate from '../../middleware/authenticate.middleware.js';
import validate from '../../middleware/validate.middleware.js';
import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/ApiResponse.js';
import ApiError from '../../utils/ApiError.js';
import * as service from './notifications.service.js';

const router = Router();

// Personal feed — every route is scoped to req.user, so plain authentication
// is the guard (no module permission needed; you can only touch your own).
router.use(authenticate);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const listSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

/**
 * @swagger
 * tags: { name: Notifications, description: Per-user notification feed (real-time via Socket.IO) }
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: My notification feed (paginated, newest first)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.listNotifications(req.user._id, req.query);
    return ApiResponse.ok(res, data, 'Notifications');
  })
);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Number of my unread notifications
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const unread = await service.unreadCount(req.user._id);
    return ApiResponse.ok(res, { unread }, 'Unread count');
  })
);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all my notifications as read
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await service.markAllRead(req.user._id);
    return ApiResponse.ok(res, result, 'All notifications marked read');
  })
);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark one of my notifications as read
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:id/read',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const doc = await service.markRead(req.user._id, req.params.id);
    if (!doc) throw ApiError.notFound('Notification not found');
    return ApiResponse.ok(res, { notification: doc }, 'Notification marked read');
  })
);

export default router;
