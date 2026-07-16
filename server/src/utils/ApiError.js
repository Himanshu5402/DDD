/**
 * Operational error carrying an HTTP status code. Thrown anywhere in the
 * request lifecycle and translated to a JSON response by the error handler.
 */
export default class ApiError extends Error {
  constructor(statusCode, message, { code, details, isOperational = true } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code; // machine-readable code, e.g. 'VALIDATION_ERROR'
    this.details = details; // optional structured details (e.g. field errors)
    this.isOperational = isOperational;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Bad request', opts) {
    return new ApiError(400, message, { code: 'BAD_REQUEST', ...opts });
  }

  static unauthorized(message = 'Unauthorized', opts) {
    return new ApiError(401, message, { code: 'UNAUTHORIZED', ...opts });
  }

  static forbidden(message = 'Forbidden', opts) {
    return new ApiError(403, message, { code: 'FORBIDDEN', ...opts });
  }

  static notFound(message = 'Resource not found', opts) {
    return new ApiError(404, message, { code: 'NOT_FOUND', ...opts });
  }

  static conflict(message = 'Conflict', opts) {
    return new ApiError(409, message, { code: 'CONFLICT', ...opts });
  }

  static unprocessable(message = 'Validation failed', opts) {
    return new ApiError(422, message, { code: 'VALIDATION_ERROR', ...opts });
  }

  static tooManyRequests(message = 'Too many requests', opts) {
    return new ApiError(429, message, { code: 'RATE_LIMITED', ...opts });
  }

  static internal(message = 'Internal server error', opts) {
    return new ApiError(500, message, { code: 'INTERNAL_ERROR', isOperational: false, ...opts });
  }
}
