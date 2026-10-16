/**
 * Indian financial year helpers.
 *
 * A financial year runs 1 April YYYY -> 31 March YYYY+1 and is labelled with
 * the two-digit years of both halves, e.g. 01-Apr-2026..31-Mar-2027 => "26-27".
 */

const FY_START_MONTH = 3; // April (0-based)

function asDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** The calendar year in which the financial year containing `value` started. */
export function financialYearStart(value) {
  const date = asDate(value);
  return date.getMonth() < FY_START_MONTH ? date.getFullYear() - 1 : date.getFullYear();
}

/** "26-27" for any date between 01-Apr-2026 and 31-Mar-2027. */
export function financialYearLabel(value) {
  const start = financialYearStart(value);
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Inclusive ISO date bounds of the financial year containing `value`. */
export function financialYearRange(value) {
  const start = financialYearStart(value);
  return {
    label: financialYearLabel(value),
    startYear: start,
    endYear: start + 1,
    from: `${start}-04-01`,
    to: `${start + 1}-03-31`,
  };
}

/** Accepts "26-27", "2026-27" or "2026-2027" and normalises to "26-27". */
export function normalizeFinancialYearLabel(raw) {
  const text = String(raw ?? '').trim();
  const match = /^(\d{2}|\d{4})\s*-\s*(\d{2}|\d{4})$/.exec(text);
  if (!match) return null;
  const short = (part) => String(Number(part) % 100).padStart(2, '0');
  return `${short(match[1])}-${short(match[2])}`;
}

/** Every financial-year label from `fromDate` up to today, oldest first. */
export function financialYearOptions(fromDate = '2015-04-01') {
  const first = financialYearStart(fromDate);
  const current = financialYearStart(new Date());
  const labels = [];
  for (let year = first; year <= current; year += 1) {
    labels.push(financialYearLabel(`${year}-04-01`));
  }
  return labels;
}
