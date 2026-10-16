import { execute, insert, query } from '../config/database.js';
import ApiError from '../utils/ApiError.js';

export async function listCategories({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : "WHERE status = 'active'";
  return query(
    `SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.category_id = c.id) AS order_count
     FROM product_categories c ${where} ORDER BY c.name ASC`,
  );
}

export async function createCategory({ name, description, status = 'active' }) {
  const id = await insert(
    'INSERT INTO product_categories (name, description, status) VALUES (?,?,?)',
    [name, description ?? null, status],
  );
  return getCategory(id);
}

export async function getCategory(id) {
  const rows = await query('SELECT * FROM product_categories WHERE id = ? LIMIT 1', [id]);
  if (rows.length === 0) throw ApiError.notFound('Category not found');
  return rows[0];
}

export async function updateCategory(id, { name, description, status }) {
  await getCategory(id);

  const updates = [];
  const params = [];
  if (name) {
    updates.push('name = ?');
    params.push(name);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description || null);
  }
  if (status === 'active' || status === 'inactive') {
    updates.push('status = ?');
    params.push(status);
  }
  if (updates.length > 0) {
    params.push(id);
    await execute(`UPDATE product_categories SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  return getCategory(id);
}

export async function deleteCategory(id) {
  await getCategory(id);
  // Soft delete to preserve order references.
  await execute("UPDATE product_categories SET status = 'inactive' WHERE id = ?", [id]);
}
