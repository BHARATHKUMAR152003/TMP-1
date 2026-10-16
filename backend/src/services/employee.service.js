import { execute, insert, query } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { hashPassword } from '../utils/password.js';
import { likeOp } from '../utils/sql.js';
import { ALL_ROLES } from '../constants/roles.js';

const PUBLIC_COLUMNS = 'id, name, email, phone, role, is_active, avatar, last_login, created_at';

/**
 * Lists application users. Accounts left over from the retired roles are
 * included (deactivated) so an admin can see and reassign them.
 */
export async function listEmployees({ role, search } = {}) {
  const where = ['1 = 1'];
  const params = [];
  if (role) {
    where.push('role = ?');
    params.push(role);
  }
  if (search) {
    where.push(`(name ${likeOp()} ? OR email ${likeOp()} ?)`);
    const term = `%${search}%`;
    params.push(term, term);
  }
  return query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE ${where.join(' AND ')} ORDER BY is_active DESC, role, name`,
    params,
  );
}

export async function getEmployee(id) {
  const rows = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
  if (rows.length === 0) throw ApiError.notFound('User not found');
  return rows[0];
}

export async function createEmployee(data) {
  if (!ALL_ROLES.includes(data.role)) {
    throw ApiError.badRequest('Role must be admin or accountant');
  }
  const existing = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [data.email]);
  if (existing.length > 0) throw ApiError.conflict('Email already in use');

  const passwordHash = await hashPassword(data.password);
  const id = await insert(
    'INSERT INTO users (name, email, password, phone, role, is_active, is_staff) VALUES (?,?,?,?,?,TRUE,TRUE)',
    [data.name, data.email, passwordHash, data.phone ?? null, data.role],
  );
  return getEmployee(id);
}

export async function updateEmployee(id, data) {
  await getEmployee(id);

  const updates = [];
  const params = [];
  if (data.name) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.phone !== undefined) {
    updates.push('phone = ?');
    params.push(data.phone || null);
  }
  if (data.role !== undefined) {
    if (!ALL_ROLES.includes(data.role)) throw ApiError.badRequest('Role must be admin or accountant');
    updates.push('role = ?');
    params.push(data.role);
  }
  if (data.password) {
    if (String(data.password).length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters');
    }
    updates.push('password = ?');
    params.push(await hashPassword(data.password));
  }
  const isActive = data.isActive ?? data.is_active;
  if (isActive !== undefined && isActive !== null) {
    updates.push('is_active = ?');
    params.push(Boolean(isActive));
  }
  if (updates.length > 0) {
    params.push(id);
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  return getEmployee(id);
}

/** Deactivating the last active admin would lock everyone out of Settings. */
export async function setActive(id, isActive) {
  const employee = await getEmployee(id);
  if (!isActive && employee.role === 'admin') {
    const rows = await query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = TRUE");
    if (Number(rows[0].n) <= 1) throw ApiError.badRequest('At least one active admin is required');
  }
  await execute('UPDATE users SET is_active = ? WHERE id = ?', [Boolean(isActive), id]);
  return getEmployee(id);
}

