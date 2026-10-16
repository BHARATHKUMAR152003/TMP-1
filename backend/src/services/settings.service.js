import { execute, query } from '../config/database.js';
import ApiError from '../utils/ApiError.js';

// Fields kept for each payment account the customer can choose to pay into.
const ACCOUNT_FIELDS = ['label', 'bank_name', 'account_name', 'account_number', 'ifsc', 'upi_id', 'qr_path'];

/** Returns all settings as a flat key/value object. */
export async function getSettings() {
  const rows = await query('SELECT setting_key, setting_value FROM settings');
  return rows.reduce((acc, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {});
}

async function getSetting(key) {
  const rows = await query('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1', [key]);
  return rows[0]?.setting_value ?? null;
}

async function putSetting(key, value) {
  await execute(
    `INSERT INTO settings (setting_key, setting_value) VALUES (?,?)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [key, value == null ? null : String(value)],
  );
}

/** Upserts a batch of settings from a key/value object. */
export async function updateSettings(values = {}) {
  for (const [key, value] of Object.entries(values)) {
    await putSetting(key, value);
  }
  return getSettings();
}

// Seller identity printed on the tax invoice. Keys map 1:1 to the settings
// table so an admin can change any of them from the Settings page.
const COMPANY_DEFAULTS = {
  company_name: 'TMP',
  company_address: '',
  company_phone: '',
  company_email: '',
  company_gst: '',
  company_state: 'Karnataka',
  company_state_code: '29',
  bank_account_name: '',
  bank_name: '',
  bank_account_number: '',
  bank_branch_ifsc: '',
  invoice_declaration:
    'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  invoice_jurisdiction: 'Bengaluru',
  invoice_prefix: 'TMP',
  default_gst_rate: '18',
  default_hsn_code: '',
};

/** Company profile used by the tax-invoice renderer, with defaults applied. */
export async function getCompanyProfile() {
  const settings = await getSettings();
  const read = (key) => {
    const value = settings[key];
    return value === null || value === undefined || value === '' ? COMPANY_DEFAULTS[key] : value;
  };

  return {
    name: read('company_name'),
    address: read('company_address'),
    phone: read('company_phone'),
    email: read('company_email'),
    gstin: read('company_gst'),
    state: read('company_state'),
    stateCode: read('company_state_code'),
    bankAccountName: read('bank_account_name'),
    bankName: read('bank_name'),
    bankAccountNumber: read('bank_account_number'),
    bankBranchIfsc: read('bank_branch_ifsc'),
    declaration: read('invoice_declaration'),
    jurisdiction: read('invoice_jurisdiction'),
    invoicePrefix: read('invoice_prefix'),
    defaultGstRate: Number(read('default_gst_rate')) || 18,
    defaultHsnCode: read('default_hsn_code'),
  };
}

/** Seeds any missing company/invoice setting with its default value. */
export async function ensureCompanyDefaults() {
  const settings = await getSettings();
  for (const [key, value] of Object.entries(COMPANY_DEFAULTS)) {
    if (!(key in settings) || settings[key] === null) await putSetting(key, value);
  }
  return getSettings();
}

/** Multiple bank/UPI accounts (customers pick one to pay) + a global note. */
export async function getPaymentConfig() {
  const raw = await getSetting('payment_accounts');
  let accounts = [];
  try {
    accounts = raw ? JSON.parse(raw) : [];
  } catch {
    accounts = [];
  }
  if (!Array.isArray(accounts)) accounts = [];
  return { accounts, instructions: await getSetting('payment_instructions') };
}

function cleanAccount(account) {
  if (!account || typeof account !== 'object') return null;

  const out = {};
  for (const key of ACCOUNT_FIELDS) {
    const value = account[key];
    out[key] = value === null || value === undefined || value === '' ? '' : String(value).trim();
  }
  // Skip empty rows.
  if (!['bank_name', 'account_number', 'upi_id', 'qr_path'].some((key) => out[key])) return null;

  out.id = String(account.id || Date.now());
  if (!out.label) out.label = out.bank_name || out.upi_id || 'Account';
  return out;
}

/** Admin replaces the full list of payment accounts (and the global note). */
export async function updatePaymentAccounts(data = {}) {
  const incoming = data.accounts;
  if (incoming === undefined || incoming === null) throw ApiError.badRequest('accounts is required');
  if (!Array.isArray(incoming)) throw ApiError.badRequest('accounts must be a list');

  const cleaned = incoming.map(cleanAccount).filter(Boolean);
  await putSetting('payment_accounts', JSON.stringify(cleaned));

  if ('instructions' in data) {
    const note = data.instructions ? String(data.instructions).trim() : '';
    await putSetting('payment_instructions', note || null);
  }
  return getPaymentConfig();
}

// ── Size rate card ───────────────────────────────────────────────────
// Digital printing is priced per sheet size, and the first copy usually costs
// more than the repeats (setup vs. run rate). Each entry therefore carries a
// first-copy price and a price for every copy after it.

function cleanRate(rate) {
  if (!rate || typeof rate !== 'object') return null;

  const size = String(rate.size ?? '').trim();
  if (!size) return null;

  const first = Number(rate.firstPrice ?? rate.first_price ?? 0);
  const rawNext = rate.nextPrice ?? rate.next_price;
  // A blank "next" means every copy costs the same as the first.
  const next = rawNext === '' || rawNext === null || rawNext === undefined ? first : Number(rawNext);
  if (!Number.isFinite(first) || first < 0 || !Number.isFinite(next) || next < 0) {
    throw ApiError.unprocessable('Validation failed', [
      { field: 'sizeRates', message: `Enter valid prices for ${size}` },
    ]);
  }

  return {
    id: String(rate.id || `${size}-${Date.now()}`),
    size,
    productionType: rate.productionType === 'offset' ? 'offset' : 'digital',
    firstPrice: Math.round(first * 100) / 100,
    nextPrice: Math.round(next * 100) / 100,
  };
}

/** The size/price list both the admin and the accountant maintain. */
export async function getSizeRates() {
  const raw = await getSetting('size_rates');
  let rates = [];
  try {
    rates = raw ? JSON.parse(raw) : [];
  } catch {
    rates = [];
  }
  return Array.isArray(rates) ? rates : [];
}

/** Replaces the whole rate card. */
export async function updateSizeRates(data = {}) {
  const incoming = data.rates ?? data;
  if (!Array.isArray(incoming)) throw ApiError.badRequest('rates must be a list');

  const cleaned = incoming.map(cleanRate).filter(Boolean);

  const seen = new Set();
  for (const rate of cleaned) {
    const key = `${rate.productionType}:${rate.size.toLowerCase()}`;
    if (seen.has(key)) {
      throw ApiError.conflict(`"${rate.size}" is listed twice for ${rate.productionType} printing`);
    }
    seen.add(key);
  }

  await putSetting('size_rates', JSON.stringify(cleaned));
  return cleaned;
}

/** Price for `quantity` copies at a given size: first copy + repeats. */
export function priceForQuantity(rate, quantity) {
  const qty = Number(quantity) > 0 ? Math.floor(Number(quantity)) : 0;
  if (!rate || qty === 0) return 0;
  const total = Number(rate.firstPrice) + (qty - 1) * Number(rate.nextPrice);
  return Math.round(total * 100) / 100;
}
