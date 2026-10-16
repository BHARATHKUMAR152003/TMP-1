import { execute, insert, query } from '../config/database.js';
import { NOTIFICATION_RECIPIENTS, DEFAULT_NOTIFICATION_RECIPIENTS } from '../constants/index.js';
import { clampInt } from '../utils/sql.js';

/**
 * Lightweight in-app notification feed. Notifications are raised as side effects
 * when orders change and surfaced in the top bar bell.
 *
 * A separate row is stored per recipient role so every portal keeps its own
 * history and unread state. Recipients default to a per-event mapping but can
 * be overridden with `targetRoles`.
 */
export async function createNotification(
  { orderId = null, eventType, title, message = null, triggeredByRole = null, targetRoles = null },
  client,
) {
  const recipients = (
    targetRoles ?? NOTIFICATION_RECIPIENTS[eventType] ?? DEFAULT_NOTIFICATION_RECIPIENTS
  ).filter((role, i, arr) => role && arr.indexOf(role) === i);

  let lastId = null;
  for (const role of recipients) {
    lastId = await insert(
      `INSERT INTO notifications (order_id, event_type, title, message, triggered_by_role, target_role)
       VALUES (?,?,?,?,?,?)`,
      [orderId, eventType, title, message, triggeredByRole, role],
      client,
    );
  }
  return lastId;
}

export async function listNotifications({ role, unreadOnly = false, limit = 30 } = {}) {
  const safeLimit = clampInt(limit, 30, 1, 100);
  const where = ['target_role = ?'];
  if (unreadOnly) where.push('is_read = FALSE');

  const items = await query(
    `SELECT id, order_id, event_type, title, message, triggered_by_role, target_role, is_read, created_at
     FROM notifications WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    [role],
  );
  const [{ unread }] = await query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE target_role = ? AND is_read = FALSE',
    [role],
  );
  return { items, unread };
}

export async function markRead(id, role) {
  await execute('UPDATE notifications SET is_read = TRUE WHERE id = ? AND target_role = ?', [id, role]);
}

export async function markAllRead(role) {
  await execute(
    'UPDATE notifications SET is_read = TRUE WHERE target_role = ? AND is_read = FALSE',
    [role],
  );
}
