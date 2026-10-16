/** Small formatting helpers shared across pages. */

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatCurrency(value) {
  const num = Number(value ?? 0);
  return currencyFormatter.format(Number.isFinite(num) ? num : 0);
}

const preciseCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Exact amount with paise — used wherever the figure must tie to an invoice. */
export function formatMoney(value) {
  const num = Number(value ?? 0);
  return preciseCurrencyFormatter.format(Number.isFinite(num) ? num : 0);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value ?? 0));
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Turns a snake_case status into Title Case words. */
export function humanize(value) {
  if (!value) return '';
  return String(value)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/** Absolute URL for a stored upload path (works with the dev proxy too). */
export function fileUrl(storedPath) {
  if (!storedPath) return null;
  if (storedPath.startsWith('http')) return storedPath;
  const clean = storedPath.replace(/^\/?/, '/');
  return clean.startsWith('/uploads') ? clean : `/${storedPath}`;
}
