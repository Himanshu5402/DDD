import { ZodError } from 'zod';
import ApiError from '../utils/ApiError.js';

/**
 * Request validation using a Zod schema shaped as
 *   { body?, query?, params? }
 * Validated + coerced values replace req.body/query/params.
 *
 *   router.post('/', validate({ body: createUserSchema }), handler)
 */
export default function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // req.query is a read-only getter in some setups; assign parsed values individually.
        const parsed = schemas.query.parse(req.query);
        Object.keys(parsed).forEach((k) => {
          req.query[k] = parsed[k];
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          ApiError.unprocessable('Validation failed', {
            details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          })
        );
      }
      next(err);
    }
  };
}
