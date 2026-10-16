/**
 * Small conversion helpers used when reading loosely-typed request payloads
 * (the frontend sends both camelCase and snake_case, and multipart values are
 * always strings).
 */

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

/** Returns the first present, non-empty value among the given keys. */
export function first(data, ...keys) {
  const source = data || {};
  for (const key of keys) {
    if (key in source && !isBlank(source[key])) return source[key];
  }
  return undefined;
}

/** Same as `first` but with an explicit fallback when nothing is present. */
export function firstOr(data, fallback, ...keys) {
  const value = first(data, ...keys);
  return value === undefined ? fallback : value;
}

/** Parses a money/decimal value, falling back to `fallback` when unusable. */
export function toDecimal(value, fallback = 0) {
  if (isBlank(value)) return Number(fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

/** Rounds to 2 decimal places without floating point drift. */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function toIntOrNull(value) {
  if (isBlank(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Trims a value to a non-empty string, or null. */
export function trimOrNull(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Multipart bodies deliver repeated fields either as an array (multiple values)
 * or a single string. Normalises both to an array.
 */
export function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Formats an amount the way the Django backend did in notification copy. */
export function money(value) {
  return `₹${round2(toDecimal(value))}`;
}
