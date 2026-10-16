import { verifyToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';
import { ADMIN_ROLES } from '../constants/roles.js';

/**
 * Extracts and verifies the Bearer token, attaching a normalized user object
 * to `req.user`. Rejects requests without a valid token.
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed authorization header'));
  }

  try {
    const decoded = verifyToken(token);
    req.user = {
      id: decoded.userId,
      role: decoded.role,
      email: decoded.email,
      customerId: decoded.customerId ?? null,
    };
    return next();
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}

/**
 * Guards a route to the given roles. Admin and manager are implicitly allowed
 * everywhere unless a route explicitly excludes them.
 */
export function authorize(...allowedRoles) {
  const permitted = new Set([...allowedRoles, ...ADMIN_ROLES]);
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!permitted.has(req.user.role)) {
      return next(ApiError.forbidden(`Role "${req.user.role}" cannot access this resource`));
    }
    return next();
  };
}

/** Restricts a route to admin/manager only (no implicit widening). */
export function authorizeStrict(...allowedRoles) {
  const permitted = new Set(allowedRoles);
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!permitted.has(req.user.role)) {
      return next(ApiError.forbidden());
    }
    return next();
  };
}

export const requireAdmin = authorizeStrict(...ADMIN_ROLES);
