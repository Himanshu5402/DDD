import AuditLog from '../models/auditLog.model.js';
import logger from '../config/logger.js';

/**
 * Write an audit entry. Fire-and-forget: auditing must never break the
 * request it is recording, so failures are logged and swallowed.
 */
export async function writeAudit(entry) {
  try {
    await AuditLog.create({
      actor: entry.actor ?? null,
      actorEmail: entry.actorEmail ?? '',
      action: entry.action,
      module: entry.module ?? '',
      entityType: entry.entityType ?? '',
      entityId: entry.entityId != null ? String(entry.entityId) : '',
      description: entry.description ?? '',
      status: entry.status ?? 'success',
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? '',
      userAgent: entry.userAgent ?? '',
      requestId: entry.requestId ?? '',
    });
  } catch (err) {
    logger.error(`Failed to write audit log: ${err.message}`);
  }
}

/**
 * Convenience that pulls actor/ip/ua/requestId off an Express request.
 */
export function auditFromRequest(req, entry) {
  return writeAudit({
    actor: req.user?._id ?? null,
    actorEmail: req.user?.email ?? '',
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? '',
    requestId: req.id,
    ...entry,
  });
}
