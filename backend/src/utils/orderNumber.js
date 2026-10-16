import { query } from '../config/database.js';
import { financialYearLabel } from './financialYear.js';
import { INVOICE_PREFIX_DEFAULT } from '../constants/index.js';

/** Builds the user-facing invoice number, e.g. TMP/0001/26-27. */
export function formatInvoiceNumber(prefix, sequence, fyLabel) {
  return `${prefix}/${String(sequence).padStart(4, '0')}/${fyLabel}`;
}

/** Parses TMP/0001/26-27 back into its parts, or null if the shape differs. */
export function parseInvoiceNumber(value) {
  const match = /^([A-Za-z0-9]+)\/(\d+)\/(\d{2}-\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return { prefix: match[1], sequence: Number(match[2]), financialYear: match[3] };
}

async function readPrefix(client) {
  const rows = await query(
    "SELECT setting_value FROM settings WHERE setting_key = 'invoice_prefix' LIMIT 1",
    [],
    client,
  );
  const value = String(rows[0]?.setting_value ?? '').trim();
  return /^[A-Za-z0-9]{1,10}$/.test(value) ? value.toUpperCase() : INVOICE_PREFIX_DEFAULT;
}

/**
 * Reserves the next invoice number for the financial year containing `date`.
 *
 * The counter lives in `invoice_sequences`, one row per (prefix, financial
 * year). The reservation is a single atomic UPSERT, so concurrent accountants,
 * retried requests and restarts can never be handed the same number; the row
 * stays locked for the rest of the caller's transaction. Sequences restart at
 * 1 in each new financial year, which is why the same number may legitimately
 * exist under two different year labels (TMP/0001/26-27 and TMP/0001/27-28).
 *
 * MUST be called inside a transaction (pass its client).
 */
export async function nextInvoiceNumber(client, { date, prefix } = {}) {
  if (!client) throw new Error('nextInvoiceNumber requires a transaction client');

  const fyLabel = financialYearLabel(date);
  const usePrefix = prefix ?? (await readPrefix(client));

  const rows = await query(
    `INSERT INTO invoice_sequences (prefix, financial_year, last_number)
     VALUES (?,?,1)
     ON CONFLICT (prefix, financial_year)
     DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = NOW()
     RETURNING last_number`,
    [usePrefix, fyLabel],
    client,
  );
  const sequence = Number(rows[0].last_number);

  return {
    invoiceNumber: formatInvoiceNumber(usePrefix, sequence, fyLabel),
    sequence,
    financialYear: fyLabel,
    prefix: usePrefix,
  };
}

/**
 * Raises the stored counter so it never re-issues a number already taken by an
 * imported historical invoice. Safe to call repeatedly.
 */
export async function reserveInvoiceNumber(client, invoiceNumber) {
  const parsed = parseInvoiceNumber(invoiceNumber);
  if (!parsed) return null;
  await query(
    `INSERT INTO invoice_sequences (prefix, financial_year, last_number)
     VALUES (?,?,?)
     ON CONFLICT (prefix, financial_year)
     DO UPDATE SET last_number = GREATEST(invoice_sequences.last_number, EXCLUDED.last_number),
                   updated_at = NOW()`,
    [parsed.prefix, parsed.financialYear, parsed.sequence],
    client,
  );
  return parsed;
}

