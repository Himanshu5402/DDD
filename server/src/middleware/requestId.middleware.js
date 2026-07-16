import { randomUUID } from 'node:crypto';

/**
 * Attaches a correlation id to every request (honoring an inbound
 * X-Request-Id if present) and echoes it back on the response. Used by the
 * logger, error handler, and audit trail to tie events together.
 */
export default function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
