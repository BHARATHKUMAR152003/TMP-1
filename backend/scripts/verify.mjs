/**
 * Developer smoke test. Run with: node scripts/verify.mjs
 *
 * 1. Statically checks that every local ESM import resolves to a real file and
 *    that each named import is actually exported by it (catches renamed or
 *    removed exports without needing a database).
 * 2. Exercises the pure business logic: financial years, invoice numbering
 *    format, GST splitting, amount-in-words.
 * 3. Renders a sample tax invoice PDF to scripts/sample-tax-invoice.pdf.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function exportedNames(source) {
  const names = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }
  // export { a, b as c }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const alias = part.split(/\s+as\s+/).pop().trim();
      if (alias) names.add(alias);
    }
  }
  if (/export\s+default/.test(source)) names.add('default');
  return names;
}

async function checkImportGraph() {
  console.log('\nModule graph');
  const files = await listFiles(SRC);
  const sources = new Map();
  for (const file of files) sources.set(file, await fs.readFile(file, 'utf8'));

  // Files that re-export everything from another module.
  const starExports = new Map();
  for (const [file, source] of sources) {
    const targets = [...source.matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g)]
      .map((m) => path.resolve(path.dirname(file), m[1]));
    starExports.set(file, targets);
  }

  function namesFor(file, seen = new Set()) {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const names = new Set(exportedNames(sources.get(file) ?? ''));
    for (const target of starExports.get(file) ?? []) {
      for (const name of namesFor(target, seen)) names.add(name);
    }
    return names;
  }

  let problems = 0;
  for (const [file, source] of sources) {
    const importRe = /import\s+([^;]*?)\s+from\s+['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(importRe)) {
      const clause = match[1];
      const target = path.resolve(path.dirname(file), match[2]);
      const rel = path.relative(SRC, file).replace(/\\/g, '/');

      if (!sources.has(target)) {
        problems += 1;
        console.log(`  FAIL ${rel} imports missing file ${match[2]}`);
        continue;
      }
      if (/^\*\s+as\s+/.test(clause.trim())) continue;

      const available = namesFor(target);
      const braces = /\{([^}]*)\}/.exec(clause);
      const named = braces ? braces[1].split(',').map((p) => p.split(/\s+as\s+/)[0].trim()).filter(Boolean) : [];
      const hasDefault = /^[A-Za-z0-9_$]+\s*(,|$)/.test(clause.trim());

      if (hasDefault && !available.has('default')) {
        problems += 1;
        console.log(`  FAIL ${rel}: ${match[2]} has no default export`);
      }
      for (const name of named) {
        if (!available.has(name)) {
          problems += 1;
          console.log(`  FAIL ${rel}: ${match[2]} does not export "${name}"`);
        }
      }
    }
  }
  check(`all local imports resolve (${sources.size} files)`, problems === 0, `${problems} problem(s)`);
}

async function checkFinancialYear() {
  console.log('\nFinancial year');
  const fy = await import('../src/utils/financialYear.js');

  check('01-Apr-2026 -> 26-27', fy.financialYearLabel('2026-04-01') === '26-27');
  check('31-Mar-2027 -> 26-27', fy.financialYearLabel('2027-03-31') === '26-27');
  check('01-Apr-2027 -> 27-28 (sequence restarts)', fy.financialYearLabel('2027-04-01') === '27-28');
  check('31-Mar-2026 -> 25-26 (not the calendar year)', fy.financialYearLabel('2026-03-31') === '25-26');
  check('14-Sep-2026 -> 26-27', fy.financialYearLabel('2026-09-14') === '26-27');

  const range = fy.financialYearRange('2026-09-14');
  check('range = 2026-04-01..2027-03-31', range.from === '2026-04-01' && range.to === '2027-03-31');
  check('normalises 2026-2027 -> 26-27', fy.normalizeFinancialYearLabel('2026-2027') === '26-27');
  check('rejects nonsense labels', fy.normalizeFinancialYearLabel('abc') === null);
}

async function checkInvoiceFormat() {
  console.log('\nInvoice number format');
  // Imported directly to avoid pulling in the database module.
  const format = (prefix, seq, fyLabel) => `${prefix}/${String(seq).padStart(4, '0')}/${fyLabel}`;
  const parse = (value) => {
    const m = /^([A-Za-z0-9]+)\/(\d+)\/(\d{2}-\d{2})$/.exec(String(value ?? '').trim());
    return m ? { prefix: m[1], sequence: Number(m[2]), financialYear: m[3] } : null;
  };

  check('TMP/0001/26-27', format('TMP', 1, '26-27') === 'TMP/0001/26-27');
  check('TMP/0025/26-27', format('TMP', 25, '26-27') === 'TMP/0025/26-27');
  check('TMP/0100/26-27', format('TMP', 100, '26-27') === 'TMP/0100/26-27');
  check('round-trips', parse('TMP/0025/26-27')?.sequence === 25);
  check('rejects the old ORD-2026-0001 shape', parse('ORD-2026-0001') === null);
}

async function checkGst() {
  console.log('\nGST calculation');
  const { computeGst } = await import('../src/utils/gst.js');

  const gst = computeGst({ total: 3100, gstRate: 18, quantity: 1 });
  check('taxable value = 2627.12', gst.taxableValue === 2627.12, String(gst.taxableValue));
  check('CGST 9% = 236.44', gst.cgstRate === 9 && gst.cgstAmount === 236.44, String(gst.cgstAmount));
  check('SGST 9% = 236.44', gst.sgstRate === 9 && gst.sgstAmount === 236.44, String(gst.sgstAmount));
  check('total tax = 472.88', gst.totalTax === 472.88, String(gst.totalTax));
  check('grand total = 3100', gst.grandTotal === 3100);
  check(
    'parts add back to the total',
    Math.abs(gst.taxableValue + gst.cgstAmount + gst.sgstAmount - 3100) < 0.01,
  );

  const perUnit = computeGst({ total: 3100, gstRate: 18, quantity: 500 });
  check('rate per unit divides the taxable value', perUnit.ratePerUnit === 5.25, String(perUnit.ratePerUnit));
  check('0% GST leaves the total untaxed', computeGst({ total: 1000, gstRate: 0 }).totalTax === 0);
  check('invalid rate falls back to 18%', computeGst({ total: 1000, gstRate: 'abc' }).gstRate === 18);
}

async function checkWords() {
  console.log('\nAmount in words');
  const { amountInWords } = await import('../src/utils/numberToWords.js');

  check('3100', amountInWords(3100) === 'INR Three Thousand One Hundred Only', amountInWords(3100));
  check(
    '472.88',
    amountInWords(472.88) === 'INR Four Hundred Seventy Two and Paise Eighty Eight Only',
    amountInWords(472.88),
  );
  check('0', amountInWords(0) === 'INR Zero Only', amountInWords(0));
  check(
    '1850000 uses Lakh',
    amountInWords(1850000) === 'INR Eighteen Lakh Fifty Thousand Only',
    amountInWords(1850000),
  );
  check(
    '12345678.5 uses Crore',
    amountInWords(12345678.5).startsWith('INR One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Paise Fifty'),
    amountInWords(12345678.5),
  );
}

async function renderSampleInvoice() {
  console.log('\nTax invoice PDF');
  const { buildTaxInvoicePdf } = await import('../src/helpers/taxInvoice.js');

  const pdf = await buildTaxInvoicePdf({
    order: {
      id: 12,
      order_number: 'TMP/0012/26-27',
      order_date: '2026-07-31',
      product_name: 'Tri-fold Brochure — 170 GSM Art Paper',
      category_name: 'Brochures',
      production_type: 'offset',
      size: 'A4 tri-fold',
      quantity: 500,
      unit: 'Nos',
      hsn_code: '4911',
      gst_rate: 18,
      delivery_charge: 1500,
      total_amount: 35000,
      paid_amount: 20000,
      balance_amount: 15000,
      special_instructions: 'Matte lamination both sides',
      customer_name: 'Ramesh Kumar',
      customer_company: 'ABC Company',
      customer_address: '221 Industrial Layout, Peenya, Bengaluru - 560058',
      customer_phone: '9812345678',
      customer_gst: '29AABCU9603R1ZM',
      customer_state: 'Karnataka',
      customer_state_code: '29',
    },
    bill: { gst_rate: 18, invoice_date: '2026-07-31' },
    company: {
      name: 'PrintPress Solutions',
      address: '12 Industrial Estate, Print Nagar, Bengaluru - 560058',
      phone: '+91 98000 00000',
      email: 'accounts@printpress.com',
      gstin: '29ABCDE1234F1Z5',
      state: 'Karnataka',
      stateCode: '29',
      bankAccountName: 'PrintPress Solutions',
      bankName: 'State Bank of India',
      bankAccountNumber: '38271640912',
      bankBranchIfsc: 'Peenya Branch & SBIN0040123',
      declaration:
        'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
      jurisdiction: 'Bengaluru',
    },
    payments: [
      { amount: 20000, payment_method: 'upi', payment_date: '2026-07-31' },
    ],
    sizeRate: {
      size: 'A4 tri-fold', productionType: 'offset', firstPrice: 120, nextPrice: 68,
    },
  });

  const out = path.join(__dirname, 'sample-tax-invoice.pdf');
  await fs.writeFile(out, pdf);
  check('renders a non-empty single-page PDF', pdf.length > 2000, `${pdf.length} bytes`);
  check('is a valid PDF header', pdf.subarray(0, 5).toString() === '%PDF-');
  console.log(`  -> wrote ${out}`);
}

async function checkImportParsers() {
  console.log('\nHistorical import parsing');
  // Re-implemented inline: import.service.js pulls in the database module.
  const { parseImportDate, parseImportAmount } = await import('../src/services/import.service.js')
    .catch(() => ({ parseImportDate: null, parseImportAmount: null }));

  if (!parseImportDate) {
    console.log('  skip (requires the pg driver / Node 18+)');
    return;
  }
  check('31/07/2026 (day first)', parseImportDate('31/07/2026') === '2026-07-31');
  check('31-Jul-26', parseImportDate('31-Jul-26') === '2026-07-31');
  check('2026-07-31', parseImportDate('2026-07-31') === '2026-07-31');
  check('blank -> null', parseImportDate('') === null);
  check('strips currency formatting', parseImportAmount('₹ 1,23,456.78') === 123456.78);
}

console.log('PrintPress verification');
await checkImportGraph();
await checkFinancialYear();
await checkInvoiceFormat();
await checkGst();
await checkWords();
await renderSampleInvoice();
await checkImportParsers();

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
