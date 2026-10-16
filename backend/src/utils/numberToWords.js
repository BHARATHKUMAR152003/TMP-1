/**
 * Converts amounts to words using the Indian numbering system
 * (Crore / Lakh / Thousand), in the phrasing used on tax invoices:
 *
 *   3100     -> "INR Three Thousand One Hundred Only"
 *   472.88   -> "INR Four Hundred Seventy Two and Paise Eighty Eight Only"
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function threeDigits(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/** Whole-number part in words, Indian grouping. Returns 'Zero' for 0. */
export function integerToWords(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'Zero';

  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;

  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));

  return parts.join(' ');
}

/**
 * Full "amount chargeable in words" line.
 * @param {number} amount
 * @param {string} currency Word used for the major unit, e.g. 'INR'.
 */
export function amountInWords(amount, currency = 'INR') {
  const value = Number(amount) || 0;
  const negative = value < 0;
  const absolute = Math.abs(value);

  const rupees = Math.floor(absolute);
  // Round the fractional part rather than truncating, so 0.885 -> 89 paise.
  const paise = Math.round((absolute - rupees) * 100);

  // Rounding up to 100 paise carries into the rupee part.
  const carriedRupees = paise === 100 ? rupees + 1 : rupees;
  const carriedPaise = paise === 100 ? 0 : paise;

  const words = [currency, integerToWords(carriedRupees)];
  if (carriedPaise > 0) words.push('and', `Paise ${twoDigits(carriedPaise)}`);
  words.push('Only');

  return `${negative ? 'Minus ' : ''}${words.join(' ')}`;
}
