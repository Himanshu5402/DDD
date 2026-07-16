import { ZodError } from 'zod';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import logger from '../config/logger.js';
import { isProd } from '../config/env.js';

/**
 * Normalizes any thrown error into the standard error envelope:
 *   { success: false, message, code, details?, requestId, stack? }
 * Handles ApiError, Zod, Mongoose (validation / cast / duplicate key), and JWT errors.
 */
// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details;

  if (err instanceof ApiError) {
    status = err.statusCode;
    code = err.code || code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'INVALID_ID';
    message = `Invalid value for "${err.path}"`;
  } else if (err.code === 11000) {
    status = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `A record with that ${field} already exists` : 'Duplicate key';
    details = err.keyValue;
  } else if (err instanceof jwt.TokenExpiredError) {
    status = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token expired';
  } else if (err instanceof jwt.JsonWebTokenError) {
    status = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid token';
  } else if (typeof err.status === 'number') {
    status = err.status;
    message = err.message || message;
  }

  // Log 5xx as errors (with stack), 4xx as warnings.
  const logMeta = { requestId: req.id, method: req.method, url: req.originalUrl };
  if (status >= 500) logger.error(err.stack || err.message, logMeta);
  else logger.warn(`${status} ${code}: ${message}`, logMeta);

  const body = { success: false, message, code, requestId: req.id };
  if (details) body.details = details;
  if (!isProd && status >= 500) body.stack = err.stack;

  res.status(status).json(body);
}
