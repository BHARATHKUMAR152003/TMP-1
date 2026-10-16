import { query } from '../config/database.js';

/**
 * Thin read helpers used by the dashboards, lists and reports so every join /
 * subquery aggregate stays explicit.
 *
 * All statements are parameterised with `?` placeholders (rewritten to `$n` by
 * the database layer). LIMIT/OFFSET values are never user-supplied verbatim —
 * always pass them through `clampInt` first.
 */
export function fetchAll(sql, params = [], client) {
  return query(sql, params, client);
}

export async function fetchOne(sql, params = [], client) {
  const rows = await query(sql, params, client);
  return rows.length > 0 ? rows[0] : null;
}

/** Returns the first column of the first row (0 when there are no rows). */
export async function scalar(sql, params = [], client) {
  const rows = await query(sql, params, client);
  if (rows.length === 0) return 0;
  const value = Object.values(rows[0])[0];
  return value === null || value === undefined ? 0 : value;
}

export function clampInt(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  const n = Number.isNaN(parsed) ? fallback : parsed;
  return Math.max(minimum, Math.min(maximum, n));
}

/** Today's date as 'YYYY-MM-DD' in local time. */
export function todayIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The date `n` days before today as 'YYYY-MM-DD'. */
export function daysAgoIso(n) {
  const date = new Date();
  date.setDate(date.getDate() - Number(n));
  return todayIso(date);
}

/** The day after `value` ('YYYY-MM-DD'), used as an exclusive upper bound. */
export function nextDayIso(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return todayIso(date);
}

/** Truncates a timestamp column to a 'YYYY-MM-DD' text value. */
export function dateOnly(expr) {
  return `to_char(${expr}, 'YYYY-MM-DD')`;
}

/** Case-insensitive LIKE operator (PostgreSQL's LIKE is case-sensitive). */
export function likeOp() {
  return 'ILIKE';
}

/**
 * ORDER BY fragment for order priority. Assumes the orders alias `o`.
 */
export const PRIORITY_ORDER_SQL =
  "CASE o.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 " +
  "WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END";
