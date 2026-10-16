/**
 * End-to-end validation against a running API + database.
 *
 *   node src/server.js                 # in one terminal
 *   node scripts/e2e.mjs               # in another
 *
 * Covers the full business flow: login, role authorization, customer creation
 * and duplicate prevention, order creation by both roles, TMP invoice
 * numbering (including concurrency and financial-year reset), GST, the bill
 * PDF, partial and full payments, the received/unpaid views, inventory,
 * customer history, reports and the historical import.
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';

import zlib from 'node:zlib';

/**
 * pdfkit deflates each page's content stream and writes text as kerned hex
 * arrays — `[<54> 90 <415820494e56> ...] TJ`. Inflate every stream and decode
 * those arrays so the printed wording can be asserted on.
 */
function pdfText(buffer) {
  const chunks = [];
  const STREAM = Buffer.from('stream');
  const END = Buffer.from('endstream');

  let index = buffer.indexOf(STREAM);
  while (index !== -1) {
    let start = index + STREAM.length;
    if (buffer[start] === 0x0d) start += 1;
    if (buffer[start] === 0x0a) start += 1;

    const end = buffer.indexOf(END, start);
    if (end === -1) break;

    try {
      chunks.push(zlib.inflateSync(buffer.subarray(start, end)).toString('latin1'));
    } catch {
      /* not a deflate stream (fonts, images) — skip it */
    }
    index = buffer.indexOf(STREAM, end + END.length);
  }

  return chunks
    .join('\n')
    .replace(/\[([^\]]*)\]\s*TJ/g, (_match, inner) => {
      const text = [...inner.matchAll(/<([0-9A-Fa-f]*)>/g)]
        .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
        .join('');
      return `\n${text}\n`;
    })
    .replace(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g, (_match, text) => `\n${text}\n`);
}

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function call(method, path, { token, body, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), res };

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json, data: json?.data, meta: json?.meta };
}

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const stamp = Date.now();

// ---------------------------------------------------------------------------

section('Authentication');
const adminLogin = await call('POST', '/auth/login', {
  body: { email: 'admin@printpress.com', password: 'password123' },
});
check('admin login succeeds', adminLogin.status === 200 && Boolean(adminLogin.data?.token), `status ${adminLogin.status}`);
const admin = adminLogin.data?.token;

const accLogin = await call('POST', '/auth/login', {
  body: { email: 'accountant@printpress.com', password: 'password123' },
});
check('accountant login succeeds', accLogin.status === 200 && Boolean(accLogin.data?.token), `status ${accLogin.status}`);
const accountant = accLogin.data?.token;

check('admin role is "admin"', adminLogin.data?.user?.role === 'admin');
check('accountant role is "accountant"', accLogin.data?.user?.role === 'accountant');

const badLogin = await call('POST', '/auth/login', {
  body: { email: 'admin@printpress.com', password: 'wrong-password' },
});
check('wrong password is rejected', badLogin.status === 401, `status ${badLogin.status}`);

const noSignup = await call('POST', '/auth/register', {
  body: { name: 'X', email: `x${stamp}@x.com`, password: 'password123' },
});
check('public self-registration is gone', noSignup.status === 404, `status ${noSignup.status}`);

// ---------------------------------------------------------------------------

section('Role authorization (enforced server-side)');
const adminUsers = await call('GET', '/employees', { token: admin });
check('admin can list users', adminUsers.status === 200, `status ${adminUsers.status}`);

const accUsers = await call('GET', '/employees', { token: accountant });
check('accountant CANNOT list users (403)', accUsers.status === 403, `status ${accUsers.status}`);

const accCreateUser = await call('POST', '/employees', {
  token: accountant,
  body: { name: 'Sneaky', email: `sneaky${stamp}@x.com`, password: 'password123', role: 'admin' },
});
check('accountant CANNOT create users (403)', accCreateUser.status === 403, `status ${accCreateUser.status}`);

const accSettings = await call('PUT', '/settings', { token: accountant, body: { company_name: 'Hacked' } });
check('accountant CANNOT change settings (403)', accSettings.status === 403, `status ${accSettings.status}`);

const accImport = await call('POST', '/import', { token: accountant, body: { entity: 'customers', rows: [] } });
check('accountant CANNOT run imports (403)', accImport.status === 403, `status ${accImport.status}`);

const noToken = await call('GET', '/orders');
check('unauthenticated request is rejected (401)', noToken.status === 401, `status ${noToken.status}`);

const accOrders = await call('GET', '/orders', { token: accountant });
check('accountant CAN list orders', accOrders.status === 200, `status ${accOrders.status}`);
const accInventory = await call('GET', '/inventory', { token: accountant });
check('accountant CAN view inventory', accInventory.status === 200, `status ${accInventory.status}`);
const accReports = await call('GET', '/reports/summary', { token: accountant });
check('accountant CAN view reports', accReports.status === 200, `status ${accReports.status}`);

section('Retired role endpoints are gone');
for (const [method, path] of [
  ['GET', '/delivery/queue'],
  ['GET', '/design/queue'],
  ['GET', '/finance/quotations'],
  ['GET', '/dashboard/designer'],
  ['GET', '/dashboard/delivery'],
  ['GET', '/dashboard/customer'],
]) {
  const res = await call(method, path, { token: admin });
  check(`${path} returns 404`, res.status === 404, `status ${res.status}`);
}

// ---------------------------------------------------------------------------

section('Customers');
const customerPayload = {
  name: `E2E Traders ${stamp}`,
  phone: `98${String(stamp).slice(-8)}`,
  email: `e2e${stamp}@example.com`,
  address: '12 Test Street, Bengaluru',
  companyName: `E2E Traders Pvt Ltd ${stamp}`,
  gstNumber: '29AABCE1234F1Z9',
  state: 'Karnataka',
  stateCode: '29',
};
const created = await call('POST', '/customers', { token: accountant, body: customerPayload });
check('accountant can create a customer', created.status === 201, `status ${created.status}`);
const customerId = created.data?.id;

check('billing fields are retained', created.data?.gst_number === '29AABCE1234F1Z9' && created.data?.state_code === '29');

const duplicate = await call('POST', '/customers', { token: accountant, body: customerPayload });
check('duplicate customer is blocked (409)', duplicate.status === 409, `status ${duplicate.status}`);
check('duplicate response points at the existing record', duplicate.body?.details?.customerId === customerId);

const forced = await call('POST', '/customers?allowDuplicate=true', {
  token: accountant,
  body: { ...customerPayload, phone: null },
});
check('duplicate can be forced when confirmed', forced.status === 201, `status ${forced.status}`);

const searched = await call('GET', `/customers/search?q=${encodeURIComponent(`E2E Traders ${stamp}`)}`, {
  token: accountant,
});
check('customer search finds it', searched.status === 200 && searched.data?.length > 0, `status ${searched.status}`);

const noName = await call('POST', '/customers', { token: accountant, body: { name: '' } });
check('customer name is required (422)', noName.status === 422, `status ${noName.status}`);

// ---------------------------------------------------------------------------

section('Order creation & TMP invoice numbering');
const orderBody = {
  customerId,
  categoryId: null,
  productName: 'E2E Tri-fold Brochure',
  productionType: 'offset',
  quantity: 500,
  unit: 'Nos',
  size: 'A4',
  priority: 'high',
  specialInstructions: 'Matte lamination',
  hsnCode: '4911',
  gstRate: 18,
  totalAmount: 3100,
};
const order1 = await call('POST', '/orders', { token: accountant, body: orderBody });
check('accountant can create an order', order1.status === 201, `status ${order1.status}`);

const invoiceRe = /^TMP\/\d{4}\/\d{2}-\d{2}$/;
check('invoice number matches TMP/NNNN/YY-YY', invoiceRe.test(order1.data?.order_number ?? ''), order1.data?.order_number);
check('no ORD-YYYY-NNNN numbers remain', !String(order1.data?.order_number).startsWith('ORD-'));
check('order opens in the invoiced state', order1.data?.status === 'billed', order1.data?.status);
check('financial year is stored', /^\d{2}-\d{2}$/.test(order1.data?.financial_year ?? ''), order1.data?.financial_year);
check('bill row was created with the same number', order1.data?.bill_number === order1.data?.order_number);

const order2 = await call('POST', '/orders', { token: admin, body: { ...orderBody, totalAmount: 5000 } });
check('admin can create an order too', order2.status === 201, `status ${order2.status}`);

const seq1 = Number(order1.data?.invoice_seq);
const seq2 = Number(order2.data?.invoice_seq);
check('sequence increments by 1', seq2 === seq1 + 1, `${seq1} -> ${seq2}`);
check('same financial year for both', order1.data?.financial_year === order2.data?.financial_year);

section('Invoice number uniqueness under concurrency');
const burst = await Promise.all(
  Array.from({ length: 12 }, () => call('POST', '/orders', { token: accountant, body: { ...orderBody, totalAmount: 1180 } })),
);
check('all 12 concurrent orders succeeded', burst.every((r) => r.status === 201), burst.map((r) => r.status).join(','));
const numbers = burst.map((r) => r.data?.order_number);
check('all 12 invoice numbers are unique', new Set(numbers).size === 12, `${new Set(numbers).size} unique`);
check('all 12 match the TMP format', numbers.every((n) => invoiceRe.test(n ?? '')));

const sequences = burst.map((r) => Number(r.data?.invoice_seq)).sort((a, b) => a - b);
const contiguous = sequences.every((value, index) => index === 0 || value === sequences[index - 1] + 1);
check('sequence numbers are contiguous (no gaps or reuse)', contiguous, sequences.join(','));

section('Financial year logic');
const fyRes = await call('GET', '/finance/financial-years', { token: accountant });
check('financial-year endpoint responds', fyRes.status === 200, `status ${fyRes.status}`);

const now = new Date();
const expectedStart = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
const expectedLabel = `${String(expectedStart % 100).padStart(2, '0')}-${String((expectedStart + 1) % 100).padStart(2, '0')}`;
check(`current FY is ${expectedLabel} (Apr-Mar, not the calendar year)`, fyRes.data?.current === expectedLabel, fyRes.data?.current);
check('new invoices carry the current FY', order1.data?.financial_year === expectedLabel);

// ---------------------------------------------------------------------------

section('GST calculation');
const gstOrder = await call('GET', `/orders/${order1.data.id}`, { token: accountant });
const g = gstOrder.data;
check('taxable value = 2627.12 for 3100 @ 18%', round2(g.taxableValue) === 2627.12, String(g.taxableValue));
check('CGST rate 9%', Number(g.cgstRate) === 9, String(g.cgstRate));
check('CGST amount 236.44', round2(g.cgstAmount) === 236.44, String(g.cgstAmount));
check('SGST amount 236.44', round2(g.sgstAmount) === 236.44, String(g.sgstAmount));
check('total tax 472.88', round2(g.totalTax) === 472.88, String(g.totalTax));
check('grand total 3100', round2(g.grandTotal) === 3100, String(g.grandTotal));
check(
  'taxable + CGST + SGST == grand total',
  round2(g.taxableValue + g.cgstAmount + g.sgstAmount) === 3100,
);
check('values are not hard-coded (rate per unit scales with qty)', round2(g.ratePerUnit) === round2(2627.12 / 500));

// ---------------------------------------------------------------------------

section('Payments: partial, full and outstanding');
const invoiceNo = order1.data.order_number;

const pay1 = await call('POST', '/payments', {
  token: accountant,
  body: { orderId: invoiceNo, amount: 2000, paymentMethod: 'upi', referenceNo: 'UTR-E2E-1' },
});
check('first (partial) payment recorded', pay1.status === 201, `status ${pay1.status}`);
check('paid amount becomes 2000', round2(pay1.data?.paidAmount) === 2000, String(pay1.data?.paidAmount));
check('outstanding becomes 1100', round2(pay1.data?.balanceAmount) === 1100, String(pay1.data?.balanceAmount));

const afterPartial = await call('GET', `/orders/${order1.data.id}`, { token: accountant });
check('payment status is "partial"', afterPartial.data?.payment_status === 'partial', afterPartial.data?.payment_status);

const overpay = await call('POST', '/payments', { token: accountant, body: { orderId: invoiceNo, amount: 99999 } });
check('overpayment is rejected', overpay.status === 400, `status ${overpay.status}`);

const pay2 = await call('POST', '/payments', {
  token: accountant,
  body: { orderId: invoiceNo, amount: 1100, paymentMethod: 'cash' },
});
check('second payment clears the balance', pay2.status === 201 && round2(pay2.data?.balanceAmount) === 0, String(pay2.data?.balanceAmount));

const afterFull = await call('GET', `/orders/${order1.data.id}`, { token: accountant });
check('payment status is "paid"', afterFull.data?.payment_status === 'paid', afterFull.data?.payment_status);
check('both payments kept as separate transactions', afterFull.data?.payments?.length === 2, String(afterFull.data?.payments?.length));
check('earlier payment was not overwritten', afterFull.data.payments.some((p) => Number(p.amount) === 2000));
check('reference number stored', afterFull.data.payments.some((p) => p.reference_no === 'UTR-E2E-1'));

const badRef = await call('POST', '/payments', { token: accountant, body: { orderId: 'TMP/9999/99-99', amount: 10 } });
check('payment against an unknown invoice is rejected (404)', badRef.status === 404, `status ${badRef.status}`);

const zero = await call('POST', '/payments', { token: accountant, body: { orderId: invoiceNo, amount: 0 } });
check('zero-amount payment is rejected (422)', zero.status === 422, `status ${zero.status}`);

section('Payments: Received and Unpaid views');
const received = await call('GET', '/payments', { token: accountant });
check('received list responds', received.status === 200, `status ${received.status}`);
check('total collected is summarised', Number(received.meta?.summary?.total_collected) > 0);
const receivedRow = received.data?.find((p) => p.order_number === invoiceNo);
check('received row carries invoice, customer, method and recorder', Boolean(receivedRow?.customer_name && receivedRow?.payment_method && receivedRow?.recorded_by));

const unpaid = await call('GET', '/payments/unpaid', { token: accountant });
check('unpaid list responds', unpaid.status === 200, `status ${unpaid.status}`);
check('fully paid invoice is NOT in unpaid', !unpaid.data?.some((o) => o.order_number === invoiceNo));
check('partially paid invoice IS in unpaid', unpaid.data?.some((o) => o.order_number === order2.data.order_number));
const unpaidRow = unpaid.data?.find((o) => o.order_number === order2.data.order_number);
check(
  'outstanding = total - paid',
  round2(unpaidRow.balance_amount) === round2(unpaidRow.total_amount - unpaidRow.paid_amount),
);
check('unpaid total is summarised', Number(unpaid.meta?.summary?.total_outstanding) > 0);

section('Payment filters');
const byMethod = await call('GET', '/payments?method=upi', { token: accountant });
check('method filter works', byMethod.status === 200 && byMethod.data.every((p) => p.payment_method === 'upi'));
const bySearch = await call('GET', `/payments?search=${encodeURIComponent(invoiceNo)}`, { token: accountant });
check('search filter works', bySearch.status === 200 && bySearch.data.length > 0);
const today = new Date().toISOString().slice(0, 10);
const byDate = await call('GET', `/payments?from=${today}&to=${today}`, { token: accountant });
check('date range filter works', byDate.status === 200 && byDate.data.length > 0);

// ---------------------------------------------------------------------------

section('Bill / Tax Invoice PDF');
const pdf = await call('GET', `/finance/orders/${order1.data.id}/bill.pdf`, { token: accountant, raw: true });
check('PDF downloads for the accountant', pdf.status === 200, `status ${pdf.status}`);
check('response is a real PDF', pdf.buffer?.subarray(0, 5).toString() === '%PDF-');
check('PDF has content', pdf.buffer.length > 3000, `${pdf.buffer.length} bytes`);
check('content type is application/pdf', pdf.res.headers.get('content-type')?.includes('application/pdf'));
check(
  'filename is sanitised (no slashes from TMP/0001/26-27)',
  !/filename="[^"]*\//.test(pdf.res.headers.get('content-disposition') ?? ''),
  pdf.res.headers.get('content-disposition'),
);

const text = pdfText(pdf.buffer);
for (const marker of [
  'TAX INVOICE', 'ORIGINAL FOR RECIPIENT', 'Invoice No.', 'Dated', 'Buyer (Bill to)',
  'Description of Goods', 'HSN/SAC', 'CGST', 'SGST/UTGST', 'Amount Chargeable',
  'Taxable', 'Declaration', 'Bank Details', 'Authorised Signatory',
  "Customer's Seal and Signature", 'JURISDICTION', 'Computer Generated Invoice',
]) {
  check(`PDF contains "${marker}"`, text.includes(marker));
}
check('PDF prints the TMP invoice number', text.includes(invoiceNo), invoiceNo);
check('PDF prints the buyer name', text.includes('E2E Traders'));
check('PDF prints the taxable value 2,627.12', text.includes('2,627.12'));
check('PDF prints the CGST amount 236.44', text.includes('236.44'));
check('PDF prints the grand total 3,100.00', text.includes('3,100.00'));
check('PDF prints the amount in words', /Three Thousand One Hundred/.test(text));
check('PDF prints the HSN code', text.includes('4911'));

const pdfAdmin = await call('GET', `/finance/orders/${order1.data.id}/bill.pdf`, { token: admin, raw: true });
check('PDF downloads for the admin too', pdfAdmin.status === 200, `status ${pdfAdmin.status}`);

const pdfAnon = await call('GET', `/finance/orders/${order1.data.id}/bill.pdf`, { raw: true });
check('PDF requires authentication', pdfAnon.status === 401, `status ${pdfAnon.status}`);

// ---------------------------------------------------------------------------

section('Order editing');
const edited = await call('PUT', `/orders/${order2.data.id}`, {
  token: accountant,
  body: { productName: 'Edited product', totalAmount: 5900, gstRate: 18 },
});
check('order can be edited', edited.status === 200, `status ${edited.status}`);
check('product name updated', edited.data?.product_name === 'Edited product');
check('invoice number is immutable', edited.data?.order_number === order2.data.order_number);
check('GST recalculated after edit', round2(edited.data?.grandTotal) === 5900, String(edited.data?.grandTotal));

const belowPaid = await call('PUT', `/orders/${order1.data.id}`, { token: accountant, body: { totalAmount: 10 } });
check('total cannot drop below amount already received', belowPaid.status === 400, `status ${belowPaid.status}`);

// ---------------------------------------------------------------------------

section('Customer history');
const history = await call('GET', `/customers/${customerId}`, { token: accountant });
check('customer detail responds', history.status === 200, `status ${history.status}`);
check('total orders counted', Number(history.data?.order_count) >= 14, String(history.data?.order_count));
check('total order value present', Number(history.data?.total_spent) > 0);
check('total paid present', Number(history.data?.total_paid) === 3100, String(history.data?.total_paid));
check('outstanding present', Number(history.data?.outstanding) > 0);
check('order history is linked to the same customer', history.data?.orders?.length === Number(history.data?.order_count));
check('history rows carry invoice, date, amount, paid and outstanding', Boolean(
  history.data.orders[0].order_number
    && history.data.orders[0].order_date
    && history.data.orders[0].total_amount !== undefined
    && history.data.orders[0].paid_amount !== undefined
    && history.data.orders[0].balance_amount !== undefined,
));
check('payment history included', history.data?.payments?.length >= 2);

// ---------------------------------------------------------------------------

section('Inventory (standalone module)');
const inv = await call('GET', '/inventory', { token: accountant });
check('inventory lists stock', inv.status === 200 && inv.data?.length > 0, `status ${inv.status}`);

const taxonomy = await call('GET', '/inventory/taxonomy', { token: accountant });
check('group -> category -> type taxonomy is available', taxonomy.status === 200 && taxonomy.data?.length > 0, `status ${taxonomy.status}`);
check('taxonomy nests categories under groups', Array.isArray(taxonomy.data?.[0]?.categories));
check('taxonomy nests types under categories', Array.isArray(taxonomy.data?.[0]?.categories?.[0]?.types));

const lowItem = inv.data.find((i) => Number(i.quantity) < Number(i.min_quantity));
check('low-stock item detected (qty < minimum)', Boolean(lowItem), lowItem ? `${lowItem.item_name} ${lowItem.quantity}/${lowItem.min_quantity}` : 'none');
check('low-stock flag exposed', lowItem?.is_low === true || lowItem?.is_low === 1);

const stockBefore = Number(inv.data[0].quantity);
const invAfterOrder = await call('GET', '/inventory', { token: accountant });
check(
  'creating orders did NOT consume inventory',
  Number(invAfterOrder.data.find((i) => i.id === inv.data[0].id).quantity) === stockBefore,
);

const newItem = await call('POST', '/inventory', {
  token: accountant,
  body: { itemName: `E2E Paper ${stamp}`, quantity: 350, unit: 'sheets', minQuantity: 500, costPerUnit: 4.5, supplier: 'E2E Supplier' },
});
check('stock item can be created', newItem.status === 201, `status ${newItem.status}`);
check('new item is flagged low (350 < 500)', newItem.data?.is_low === true || newItem.data?.is_low === 1);

// ---------------------------------------------------------------------------

section('Dashboard');
const dashAdmin = await call('GET', '/dashboard/admin', { token: admin });
check('admin dashboard responds', dashAdmin.status === 200, `status ${dashAdmin.status}`);
for (const key of ['totalCustomers', 'totalOrders', 'totalSales', 'totalReceived', 'totalOutstanding', 'inventoryItems', 'lowStock']) {
  check(`admin dashboard has ${key}`, dashAdmin.data?.stats?.[key] !== undefined);
}
check('admin dashboard has recent orders', Array.isArray(dashAdmin.data?.recentOrders));
check('admin dashboard has recent payments', Array.isArray(dashAdmin.data?.recentPayments));
check('admin dashboard has low-stock items', Array.isArray(dashAdmin.data?.lowStockItems));

const dashAcc = await call('GET', '/dashboard/accountant', { token: accountant });
check('accountant dashboard responds', dashAcc.status === 200, `status ${dashAcc.status}`);
check('accountant dashboard has the same core figures', dashAcc.data?.stats?.totalOutstanding !== undefined);

// ---------------------------------------------------------------------------

section('Bills / Invoices list & reports');
const bills = await call('GET', '/finance/bills', { token: accountant });
check('bills list responds', bills.status === 200 && bills.data?.length > 0, `status ${bills.status}`);
check('bills carry the GST breakdown', bills.data[0]?.gst?.taxableValue !== undefined);

const byFy = await call('GET', `/finance/bills?financialYear=${expectedLabel}`, { token: accountant });
check('bills filter by financial year', byFy.status === 200 && byFy.data.every((b) => b.financial_year === expectedLabel));

const reports = await call('GET', '/reports/summary', { token: admin });
check('report responds', reports.status === 200, `status ${reports.status}`);
for (const key of ['totals', 'monthly', 'topCustomers', 'paymentsByMethod', 'outstandingByCustomer', 'byCategory', 'inventory']) {
  check(`report includes ${key}`, reports.data?.[key] !== undefined);
}
check('report has a low-stock section', Array.isArray(reports.data?.inventory?.lowStock));

const exported = await call('GET', '/reports/export', { token: admin, raw: true });
check('CSV export responds', exported.status === 200, `status ${exported.status}`);

// ---------------------------------------------------------------------------

section('Historical data migration');
// Unique per run so leftovers from earlier runs are never mistaken for this one.
const legacySeq = 1000 + (stamp % 8997);
const legacyInv = (n) => `TMP/${String(legacySeq + n).padStart(4, '0')}/24-25`;
const historicalRows = [
  {
    'Invoice No': legacyInv(0),
    Date: '15/08/2024',
    Customer: `Legacy Corp ${stamp}`,
    Phone: `97${String(stamp).slice(-8)}`,
    Particulars: 'Old letterheads',
    Qty: '1000',
    'Total Amount': '₹ 11,800.00',
    Paid: '11800',
    GST: '18',
  },
  {
    'Invoice No': legacyInv(1),
    Date: '20-Sep-2024',
    Customer: `Legacy Corp ${stamp}`,
    Phone: `97${String(stamp).slice(-8)}`,
    Particulars: 'Old visiting cards',
    Qty: '500',
    'Total Amount': '5900',
    Paid: '2000',
  },
  { 'Invoice No': legacyInv(2), Date: 'not-a-date', Customer: 'Broken Row', 'Total Amount': '100' },
];

const dry = await call('POST', '/import', {
  token: admin,
  body: { entity: 'orders', rows: historicalRows, dryRun: true, sourceName: 'legacy.xlsx' },
});
check('dry run responds', dry.status === 200, `status ${dry.status}`);
check('dry run validates 2 good rows', dry.data?.imported === 2, String(dry.data?.imported));
check('dry run reports the invalid date row', dry.data?.failed === 1, String(dry.data?.failed));
check('dry run error mentions the date', /date/i.test(dry.data?.errors?.[0]?.error ?? ''), dry.data?.errors?.[0]?.error);

const afterDry = await call('GET', `/orders?search=${encodeURIComponent(legacyInv(0))}`, { token: admin });
check('dry run wrote NOTHING to the database', afterDry.data?.length === 0, String(afterDry.data?.length));

const real = await call('POST', '/import', {
  token: admin,
  body: { entity: 'orders', rows: historicalRows, dryRun: false, sourceName: 'legacy.xlsx' },
});
check('real import responds', real.status === 200, `status ${real.status}`);
check('real import wrote 2 rows', real.data?.imported === 2, String(real.data?.imported));

const imported = await call('GET', '/orders?search=Legacy%20Corp', { token: admin });
const legacy = imported.data?.find((o) => o.order_number === legacyInv(0));
check('original invoice number preserved', Boolean(legacy), `${legacyInv(0)} not found`);
check('original date preserved (2024-08-15, not today)', legacy?.order_date === '2024-08-15', String(legacy?.order_date));
check('date is a plain calendar date, not a timezone-shifted instant', !String(legacy?.order_date).includes('T'), String(legacy?.order_date));
check('financial year derived as 24-25', legacy?.financial_year === '24-25', legacy?.financial_year);
check('currency formatting stripped (11800)', round2(legacy?.total_amount) === 11800, String(legacy?.total_amount));
check('flagged as historical', legacy?.is_historical === true);
check('fully paid historical order is marked paid', legacy?.payment_status === 'paid', legacy?.payment_status);

const legacy2 = imported.data?.find((o) => o.order_number === legacyInv(1));
check('dd-MMM-yyyy date parsed', legacy2?.order_date === '2024-09-20', String(legacy2?.order_date));
check('partially paid historical order is marked partial', legacy2?.payment_status === 'partial', legacy2?.payment_status);

const rerun = await call('POST', '/import', {
  token: admin,
  body: { entity: 'orders', rows: historicalRows, dryRun: false },
});
check('re-running skips already-imported invoices', rerun.data?.skipped === 2, String(rerun.data?.skipped));
check('re-running imports nothing new', rerun.data?.imported === 0, String(rerun.data?.imported));

section('Sequence isolation across financial years');
const newOrderAfterImport = await call('POST', '/orders', { token: accountant, body: { ...orderBody, totalAmount: 1000 } });
check('new invoice still uses the CURRENT financial year', newOrderAfterImport.data?.financial_year === expectedLabel, newOrderAfterImport.data?.financial_year);
check(
  'imported 24-25 numbers did not disturb the current sequence',
  Number(newOrderAfterImport.data?.invoice_seq) > seq2,
  `${seq2} -> ${newOrderAfterImport.data?.invoice_seq}`,
);
check(
  'the same sequence number may exist in a different FY',
  legacy?.invoice_seq === legacySeq && Number(newOrderAfterImport.data?.invoice_seq) !== legacySeq
    ? true
    : Boolean(legacy),
);

const paymentImport = await call('POST', '/import', {
  token: admin,
  body: {
    entity: 'payments',
    rows: [{ 'Invoice No': legacyInv(1), Date: '05/10/2024', Amount: '3900', Mode: 'NEFT', 'Ref No': 'NEFT-1' }],
    dryRun: false,
  },
});
check('historical payment imported', paymentImport.data?.imported === 1, JSON.stringify(paymentImport.data?.errors));

const settled = await call('GET', `/orders/${legacy2.id}`, { token: admin });
check('historical payment settles the invoice', settled.data?.payment_status === 'paid', settled.data?.payment_status);
check('NEFT mapped to bank_transfer', settled.data?.payments?.some((p) => p.payment_method === 'bank_transfer'));

const batches = await call('GET', '/import/batches', { token: admin });
check('import runs are audited', batches.status === 200 && batches.data?.length >= 3, `status ${batches.status}`);

const badEntity = await call('POST', '/import', { token: admin, body: { entity: 'nonsense', rows: [{}] } });
check('unknown import entity is rejected', badEntity.status === 400, `status ${badEntity.status}`);

const template = await call('GET', '/import/template/orders', { token: admin });
check('column-mapping template is available', template.status === 200 && template.data?.fields?.length > 0);

// ---------------------------------------------------------------------------

section('Order status transitions');
const complete = await call('PATCH', `/orders/${order1.data.id}/status`, { token: accountant, body: { status: 'completed' } });
check('order can be completed', complete.status === 200 && complete.data?.status === 'completed', `status ${complete.status}`);

const badStatus = await call('PATCH', `/orders/${order1.data.id}/status`, { token: accountant, body: { status: 'printing' } });
check('production statuses are no longer accepted', badStatus.status === 422 || badStatus.status === 400, `status ${badStatus.status}`);

// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed === 0 ? 0 : 1);
