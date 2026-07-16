import ApiError from '../utils/ApiError.js';

/** Catch-all for unmatched routes → 404 through the error handler. */
export default function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
