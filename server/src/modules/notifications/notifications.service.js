import Notification from '../../models/notification.model.js';
import { emitToUser } from '../../socket/index.js';
import logger from '../../config/logger.js';

const FEED_POPULATE = [{ path: 'actor', select: 'name email avatar designation' }];

/**
 * Create a notification for one user and push it to their socket room in real
 * time. Never notifies the actor about their own action, and never throws —
 * a failed notification must not fail the business action that triggered it.
 */
export async function notify(recipientId, { actor, type, message, entityType, entityId, link }) {
  try {
    if (!recipientId) return null;
    if (actor && String(actor) === String(recipientId)) return null; // no self-notify

    const doc = await Notification.create({
      recipient: recipientId,
      actor: actor || null,
      type: type || 'generic',
      message,
      entityType: entityType || '',
      entityId: entityId || null,
      link: link || '',
    });

    const populated = await Notification.findById(doc._id).populate(FEED_POPULATE);
    emitToUser(recipientId, 'notification:new', { notification: populated });
    return populated;
  } catch (err) {
    logger.error(`notify() failed for user ${recipientId}: ${err.message}`);
    return null;
  }
}

/** Notify many users at once (deduped, actor excluded). */
export async function notifyMany(recipientIds, payload) {
  const unique = [...new Set((recipientIds || []).map(String))];
  return Promise.all(unique.map((id) => notify(id, payload)));
}

export async function listNotifications(userId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const filter = { recipient: userId };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).populate(FEED_POPULATE).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: userId, read: false }),
  ]);
  return { items, page, limit, total, unread };
}

export async function unreadCount(userId) {
  return Notification.countDocuments({ recipient: userId, read: false });
}

export async function markRead(userId, notificationId) {
  const doc = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { read: true, readAt: new Date() },
    { new: true }
  );
  return doc;
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { recipient: userId, read: false },
    { read: true, readAt: new Date() }
  );
  return { modified: result.modifiedCount };
}
