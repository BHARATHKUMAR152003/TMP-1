import { execute, insert, query, withTransaction } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { fetchAll, fetchOne, likeOp } from '../utils/sql.js';
import { first, toDecimal, toIntOrNull, trimOrNull } from '../utils/values.js';

const ITEM_SELECT = `
  SELECT i.*, g.name AS group_name, c.name AS category_name, t.name AS type_name,
         (i.quantity <= i.min_quantity) AS is_low
  FROM inventory i
  LEFT JOIN inventory_groups g ON g.id = i.group_id
  LEFT JOIN inventory_categories c ON c.id = i.category_id
  LEFT JOIN inventory_types t ON t.id = i.type_id
`;

const TAXONOMY_KEYS = ['groupId', 'group_id', 'categoryId', 'category_id', 'typeId', 'type_id'];

export async function getItem(id) {
  const row = await fetchOne(`${ITEM_SELECT} WHERE i.id = ? LIMIT 1`, [id]);
  if (!row) throw ApiError.notFound('Inventory item not found');
  return row;
}

function hasTaxonomyKeys(data) {
  return TAXONOMY_KEYS.some((key) => key in (data ?? {}));
}

/**
 * Resolves (groupId, categoryId, typeId) from the ids in `data`, deriving the
 * parents from the most specific level supplied, and validating each node.
 */
async function resolveTaxonomy(data) {
  const typeId = first(data, 'typeId', 'type_id');
  const categoryId = first(data, 'categoryId', 'category_id');
  const groupId = first(data, 'groupId', 'group_id');

  if (typeId) {
    const row = await fetchOne(
      `SELECT t.id AS type_id, c.id AS category_id, c.group_id
       FROM inventory_types t JOIN inventory_categories c ON c.id = t.category_id
       WHERE t.id = ? LIMIT 1`,
      [typeId],
    );
    if (!row) {
      throw ApiError.unprocessable('Validation failed', [{ field: 'typeId', message: 'Invalid type' }]);
    }
    return { groupId: row.group_id, categoryId: row.category_id, typeId: row.type_id };
  }
  if (categoryId) {
    const row = await fetchOne('SELECT id, group_id FROM inventory_categories WHERE id = ? LIMIT 1', [categoryId]);
    if (!row) {
      throw ApiError.unprocessable('Validation failed', [{ field: 'categoryId', message: 'Invalid category' }]);
    }
    return { groupId: row.group_id, categoryId: row.id, typeId: null };
  }
  if (groupId) {
    const row = await fetchOne('SELECT id FROM inventory_groups WHERE id = ? LIMIT 1', [groupId]);
    if (!row) {
      throw ApiError.unprocessable('Validation failed', [{ field: 'groupId', message: 'Invalid group' }]);
    }
    return { groupId: row.id, categoryId: null, typeId: null };
  }
  return { groupId: null, categoryId: null, typeId: null };
}

export async function listInventory(query = {}) {
  const where = ['1=1'];
  const params = [];

  const groupId = first(query, 'groupId', 'group_id');
  if (groupId) {
    where.push('i.group_id = ?');
    params.push(groupId);
  }
  const categoryId = first(query, 'categoryId', 'category_id');
  if (categoryId) {
    where.push('i.category_id = ?');
    params.push(categoryId);
  }
  const typeId = first(query, 'typeId', 'type_id');
  if (typeId) {
    where.push('i.type_id = ?');
    params.push(typeId);
  }
  if (query.lowOnly === 'true' || query.lowOnly === true) {
    where.push('i.quantity <= i.min_quantity');
  }
  if (query.search) {
    where.push(
      `(i.item_name ${likeOp()} ? OR i.supplier ${likeOp()} ? OR g.name ${likeOp()} ? ` +
        `OR c.name ${likeOp()} ? OR t.name ${likeOp()} ?)`,
    );
    const term = `%${query.search}%`;
    params.push(term, term, term, term, term);
  }

  return fetchAll(
    `${ITEM_SELECT} WHERE ${where.join(' AND ')} ORDER BY g.name, c.name, t.name, i.item_name ASC`,
    params,
  );
}

export async function createItem(data) {
  const itemName = String(first(data, 'itemName', 'item_name') ?? '').trim();
  if (!itemName) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'itemName', message: 'Item name is required' }]);
  }

  const taxonomy = await resolveTaxonomy(data);
  const id = await insert(
    `INSERT INTO inventory
       (item_name, group_id, category_id, type_id, quantity, unit, min_quantity, cost_per_unit, supplier)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      itemName, taxonomy.groupId, taxonomy.categoryId, taxonomy.typeId,
      toDecimal(first(data, 'quantity'), 0), trimOrNull(data.unit),
      toDecimal(first(data, 'minQuantity', 'min_quantity'), 0),
      toDecimal(first(data, 'costPerUnit', 'cost_per_unit'), 0),
      trimOrNull(data.supplier),
    ],
  );
  return getItem(id);
}

export async function updateItem(id, data) {
  await getItem(id);

  const updates = [];
  const params = [];
  const name = first(data, 'itemName', 'item_name');
  if (name !== undefined) {
    updates.push('item_name = ?');
    params.push(name);
  }
  if (hasTaxonomyKeys(data)) {
    const taxonomy = await resolveTaxonomy(data);
    updates.push('group_id = ?', 'category_id = ?', 'type_id = ?');
    params.push(taxonomy.groupId, taxonomy.categoryId, taxonomy.typeId);
  }
  if (first(data, 'quantity') !== undefined) {
    updates.push('quantity = ?');
    params.push(toDecimal(data.quantity, 0));
  }
  if (data.unit !== undefined) {
    updates.push('unit = ?');
    params.push(trimOrNull(data.unit));
  }
  const minQuantity = first(data, 'minQuantity', 'min_quantity');
  if (minQuantity !== undefined) {
    updates.push('min_quantity = ?');
    params.push(toDecimal(minQuantity, 0));
  }
  const costPerUnit = first(data, 'costPerUnit', 'cost_per_unit');
  if (costPerUnit !== undefined) {
    updates.push('cost_per_unit = ?');
    params.push(toDecimal(costPerUnit, 0));
  }
  if (data.supplier !== undefined) {
    updates.push('supplier = ?');
    params.push(trimOrNull(data.supplier));
  }

  if (updates.length > 0) {
    params.push(id);
    await execute(`UPDATE inventory SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  return getItem(id);
}

export async function deleteItem(id) {
  await getItem(id);
  await execute('DELETE FROM inventory WHERE id = ?', [id]);
}

/**
 * Adds to or removes from stock by a relative amount. This is the day-to-day
 * action ("two more reams came in", "used three"), so it is a single signed
 * delta rather than making the user work out the new total themselves.
 * A negative delta is also written to the usage log.
 */
export async function adjustItem(id, user, data = {}) {
  const delta = toDecimal(first(data, 'delta', 'quantity'), 0);
  if (!delta) {
    throw ApiError.unprocessable('Validation failed', [
      { field: 'delta', message: 'Enter an amount to add or remove' },
    ]);
  }

  await withTransaction(async (client) => {
    const rows = await query(
      'SELECT id, item_name, quantity, unit FROM inventory WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
      client,
    );
    const item = rows[0];
    if (!item) throw ApiError.notFound('Inventory item not found');

    const next = Number(item.quantity) + delta;
    if (next < 0) {
      throw ApiError.badRequest(
        `Only ${item.quantity} ${item.unit || 'units'} of ${item.item_name} left in stock`,
      );
    }

    await execute('UPDATE inventory SET quantity = ? WHERE id = ?', [next, id], client);

    if (delta < 0) {
      await execute(
        `INSERT INTO inventory_usages (item_id, order_id, quantity, unit, used_by_user_id, note)
         VALUES (?,?,?,?,?,?)`,
        [
          id,
          toIntOrNull(first(data, 'orderId', 'order_id')),
          Math.abs(delta),
          item.unit,
          user.id,
          trimOrNull(first(data, 'note')),
        ],
        client,
      );
    }
  });

  return getItem(id);
}

/** Operator records how much of an item was used; decrements the stock. */
export async function consumeItem(id, user, data = {}) {
  const qty = toDecimal(first(data, 'quantity'), 0);
  if (!(qty > 0)) {
    throw ApiError.unprocessable('Validation failed', [
      { field: 'quantity', message: 'Enter a quantity greater than zero' },
    ]);
  }

  await withTransaction(async (client) => {
    const rows = await query(
      'SELECT id, item_name, quantity, unit FROM inventory WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
      client,
    );
    const item = rows[0];
    if (!item) throw ApiError.notFound('Inventory item not found');
    if (qty > Number(item.quantity)) {
      throw ApiError.badRequest(
        `Only ${item.quantity} ${item.unit || 'units'} of ${item.item_name} left in stock`,
      );
    }

    await execute('UPDATE inventory SET quantity = quantity - ? WHERE id = ?', [qty, id], client);
    await execute(
      `INSERT INTO inventory_usages (item_id, order_id, quantity, unit, used_by_user_id, note)
       VALUES (?,?,?,?,?,?)`,
      [id, toIntOrNull(first(data, 'orderId', 'order_id')), qty, item.unit, user.id, trimOrNull(first(data, 'note'))],
      client,
    );
  });

  return getItem(id);
}

export function listUsage() {
  return fetchAll(
    `SELECT u.id, u.quantity, u.unit, u.note, u.created_at,
            i.item_name, o.order_number, usr.name AS used_by
     FROM inventory_usages u
     LEFT JOIN inventory i ON i.id = u.item_id
     LEFT JOIN orders o ON o.id = u.order_id
     LEFT JOIN users usr ON usr.id = u.used_by_user_id
     ORDER BY u.created_at DESC LIMIT 100`,
  );
}

// ── Taxonomy: groups → categories → types (fully user-managed) ─────────

/**
 * The whole group → category → type tree with per-node item counts, used to
 * drive the cascading item form and the manage-taxonomy panel.
 */
export async function getTaxonomy() {
  const [groups, categories, types] = await Promise.all([
    fetchAll('SELECT id, name FROM inventory_groups ORDER BY name'),
    fetchAll('SELECT id, group_id, name FROM inventory_categories ORDER BY name'),
    fetchAll('SELECT id, category_id, name FROM inventory_types ORDER BY name'),
  ]);

  const counts = async (column) => {
    const rows = await fetchAll(
      `SELECT ${column} AS key_id, COUNT(*) AS n FROM inventory WHERE ${column} IS NOT NULL GROUP BY ${column}`,
    );
    return new Map(rows.map((r) => [r.key_id, r.n]));
  };
  const [groupCounts, categoryCounts, typeCounts] = await Promise.all([
    counts('group_id'), counts('category_id'), counts('type_id'),
  ]);

  const typesByCategory = new Map();
  for (const t of types) {
    const list = typesByCategory.get(t.category_id) ?? [];
    list.push({ id: t.id, name: t.name, itemCount: typeCounts.get(t.id) ?? 0 });
    typesByCategory.set(t.category_id, list);
  }
  const categoriesByGroup = new Map();
  for (const c of categories) {
    const list = categoriesByGroup.get(c.group_id) ?? [];
    list.push({
      id: c.id,
      name: c.name,
      itemCount: categoryCounts.get(c.id) ?? 0,
      types: typesByCategory.get(c.id) ?? [],
    });
    categoriesByGroup.set(c.group_id, list);
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    itemCount: groupCounts.get(g.id) ?? 0,
    categories: categoriesByGroup.get(g.id) ?? [],
  }));
}

function cleanName(data, label) {
  const name = String(first(data, 'name') ?? '').trim();
  if (!name) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'name', message: `${label} name is required` }]);
  }
  return name;
}

// --- groups ---
export async function createGroup(data) {
  const name = cleanName(data, 'Group');
  const existing = await fetchOne('SELECT id FROM inventory_groups WHERE name = ? LIMIT 1', [name]);
  if (existing) throw ApiError.conflict('A group with that name already exists');
  const id = await insert('INSERT INTO inventory_groups (name) VALUES (?)', [name]);
  return { id, name };
}

export async function updateGroup(id, data) {
  const group = await fetchOne('SELECT id FROM inventory_groups WHERE id = ? LIMIT 1', [id]);
  if (!group) throw ApiError.notFound('Group not found');
  const name = cleanName(data, 'Group');
  const clash = await fetchOne('SELECT id FROM inventory_groups WHERE name = ? AND id <> ? LIMIT 1', [name, id]);
  if (clash) throw ApiError.conflict('A group with that name already exists');
  await execute('UPDATE inventory_groups SET name = ? WHERE id = ?', [name, id]);
  return { id: Number(id), name };
}

export async function deleteGroup(id) {
  const group = await fetchOne('SELECT id FROM inventory_groups WHERE id = ? LIMIT 1', [id]);
  if (!group) throw ApiError.notFound('Group not found');
  await execute('DELETE FROM inventory_groups WHERE id = ?', [id]);
}

// --- categories ---
export async function createCategory(data) {
  const groupId = first(data, 'groupId', 'group_id');
  const group = groupId
    ? await fetchOne('SELECT id FROM inventory_groups WHERE id = ? LIMIT 1', [groupId])
    : null;
  if (!group) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'groupId', message: 'A valid group is required' }]);
  }
  const name = cleanName(data, 'Category');
  const existing = await fetchOne(
    'SELECT id FROM inventory_categories WHERE group_id = ? AND name = ? LIMIT 1',
    [group.id, name],
  );
  if (existing) throw ApiError.conflict('That category already exists in this group');

  const id = await insert(
    'INSERT INTO inventory_categories (group_id, name) VALUES (?,?)',
    [group.id, name],
  );
  return { id, groupId: group.id, name };
}

export async function updateCategory(id, data) {
  const category = await fetchOne('SELECT id, group_id FROM inventory_categories WHERE id = ? LIMIT 1', [id]);
  if (!category) throw ApiError.notFound('Category not found');
  const name = cleanName(data, 'Category');
  const clash = await fetchOne(
    'SELECT id FROM inventory_categories WHERE group_id = ? AND name = ? AND id <> ? LIMIT 1',
    [category.group_id, name, id],
  );
  if (clash) throw ApiError.conflict('That category already exists in this group');
  await execute('UPDATE inventory_categories SET name = ? WHERE id = ?', [name, id]);
  return { id: Number(id), groupId: category.group_id, name };
}

export async function deleteCategory(id) {
  const category = await fetchOne('SELECT id FROM inventory_categories WHERE id = ? LIMIT 1', [id]);
  if (!category) throw ApiError.notFound('Category not found');
  await execute('DELETE FROM inventory_categories WHERE id = ?', [id]);
}

// --- types ---
export async function createType(data) {
  const categoryId = first(data, 'categoryId', 'category_id');
  const category = categoryId
    ? await fetchOne('SELECT id FROM inventory_categories WHERE id = ? LIMIT 1', [categoryId])
    : null;
  if (!category) {
    throw ApiError.unprocessable('Validation failed', [
      { field: 'categoryId', message: 'A valid category is required' },
    ]);
  }
  const name = cleanName(data, 'Type');
  const existing = await fetchOne(
    'SELECT id FROM inventory_types WHERE category_id = ? AND name = ? LIMIT 1',
    [category.id, name],
  );
  if (existing) throw ApiError.conflict('That type already exists in this category');

  const id = await insert(
    'INSERT INTO inventory_types (category_id, name) VALUES (?,?)',
    [category.id, name],
  );
  return { id, categoryId: category.id, name };
}

export async function updateType(id, data) {
  const type = await fetchOne('SELECT id, category_id FROM inventory_types WHERE id = ? LIMIT 1', [id]);
  if (!type) throw ApiError.notFound('Type not found');
  const name = cleanName(data, 'Type');
  const clash = await fetchOne(
    'SELECT id FROM inventory_types WHERE category_id = ? AND name = ? AND id <> ? LIMIT 1',
    [type.category_id, name, id],
  );
  if (clash) throw ApiError.conflict('That type already exists in this category');
  await execute('UPDATE inventory_types SET name = ? WHERE id = ?', [name, id]);
  return { id: Number(id), categoryId: type.category_id, name };
}

export async function deleteType(id) {
  const type = await fetchOne('SELECT id FROM inventory_types WHERE id = ? LIMIT 1', [id]);
  if (!type) throw ApiError.notFound('Type not found');
  await execute('DELETE FROM inventory_types WHERE id = ?', [id]);
}
