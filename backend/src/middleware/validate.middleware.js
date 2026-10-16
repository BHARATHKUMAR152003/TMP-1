import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

/**
 * Runs a list of express-validator chains, then collects any errors into a
 * single 422 response. Placed after the validator array on each route.
 */
export function validate(validations) {
  return async (req, _res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const details = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));
    return next(ApiError.unprocessable('Validation failed', details));
  };
}
