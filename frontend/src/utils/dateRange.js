/**
 * Named date-range presets for the list filters. Everything is computed in the
 * browser's local time and returned as plain 'YYYY-MM-DD' strings, which is what
 * the API expects for its `from`/`to` query params.
 */

export function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Indian financial year runs 1 April -> 31 March. */
export function financialYearStart(today = new Date()) {
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return new Date(year, 3, 1);
}

export const DATE_PRESETS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'financial', label: 'This financial year' },
  { value: 'custom', label: 'Custom range…' },
];

/**
 * Resolves a preset to a { from, to } pair. 'all' clears both dates and
 * 'custom' keeps whatever the user already typed.
 */
export function resolvePreset(preset, current = {}, today = new Date()) {
  const end = toIsoDate(today);

  switch (preset) {
    case 'today':
      return { from: end, to: end };
    case 'week': {
      // Week starts on Monday, matching how the shop talks about "this week".
      const start = new Date(today);
      const dayOffset = (today.getDay() + 6) % 7;
      start.setDate(today.getDate() - dayOffset);
      return { from: toIsoDate(start), to: end };
    }
    case 'month':
      return { from: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: end };
    case 'financial':
      return { from: toIsoDate(financialYearStart(today)), to: end };
    case 'custom':
      return { from: current.from ?? '', to: current.to ?? '' };
    case 'all':
    default:
      return { from: '', to: '' };
  }
}

export const EMPTY_DATE_RANGE = { preset: 'all', from: '', to: '' };
