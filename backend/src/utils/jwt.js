import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * Signs a JWT for an authenticated user. The payload intentionally carries
 * `customerId` so customer-role users can place orders without a second lookup.
 */
export function signToken({ userId, role, email, customerId = null }) {
  return jwt.sign({ userId, role, email, customerId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}
