import { execute, query } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';
import { hashPassword, comparePassword, needsRehash } from '../utils/password.js';
import { trimOrNull } from '../utils/values.js';
import { isKnownRole } from '../constants/roles.js';

/** Shapes the user object returned to the client (never leaks the hash). */
function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    avatar: row.avatar,
  };
}

/**
 * Authenticates a user and returns { token, user }. Accounts left on a retired
 * role are refused here as well as by is_active, so a stale token or password
 * can never re-open a removed portal.
 */
export async function login({ email, password }) {
  const rows = await query(
    'SELECT id, name, email, password, phone, role, avatar, is_active FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  const user = rows[0];
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  if (!user.is_active) throw ApiError.forbidden('Your account has been deactivated');
  if (!isKnownRole(user.role)) {
    throw ApiError.forbidden('This account type is no longer supported. Contact an administrator.');
  }

  const passwordOk = await comparePassword(password, user.password);
  if (!passwordOk) throw ApiError.unauthorized('Invalid email or password');

  await execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

  // Transparently upgrade password hashes inherited from the previous backend.
  if (needsRehash(user.password)) {
    await execute('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(password), user.id]);
  }

  const token = signToken({ userId: user.id, role: user.role, email: user.email });
  return { token, user: toPublicUser(user) };
}

/** Returns the current user's profile. */
export async function getProfile(userId) {
  const rows = await query(
    'SELECT id, name, email, phone, role, avatar, last_login, created_at FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  const user = rows[0];
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/** Both roles can edit their own name, phone and avatar. */
export async function updateProfile(user, data = {}) {
  const errors = [];
  let name;
  if (data.name !== undefined) {
    name = String(data.name).trim();
    if (name.length < 2 || name.length > 120) {
      errors.push({ field: 'name', message: 'Name must be 2-120 characters' });
    }
  }
  if (errors.length > 0) throw ApiError.unprocessable('Validation failed', errors);

  const updates = [];
  const params = [];
  if (name) {
    updates.push('name = ?');
    params.push(name);
  }
  if ('phone' in data) {
    updates.push('phone = ?');
    params.push(trimOrNull(data.phone));
  }
  if ('avatar' in data) {
    updates.push('avatar = ?');
    params.push(data.avatar || null);
  }
  if (updates.length > 0) {
    params.push(user.id);
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  return getProfile(user.id);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const rows = await query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
  if (rows.length === 0) throw ApiError.notFound('User not found');

  const ok = await comparePassword(currentPassword, rows[0].password);
  if (!ok) throw ApiError.badRequest('Current password is incorrect');

  const hash = await hashPassword(newPassword);
  await execute('UPDATE users SET password = ? WHERE id = ?', [hash, userId]);
}
