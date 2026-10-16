import PDFDocument from 'pdfkit';
import { computeGstBreakdown } from '../utils/gst.js';
import { amountInWords } from '../utils/numberToWords.js';

/**
 * Renders the company's Tax Invoice as a PDF, reproducing the layout of the
 * printed form: seller/buyer blocks with the invoice reference grid, the goods
 * table with CGST/SGST lines, amount in words, the HSN tax summary, the
 * declaration, bank details and signature panels.
 *
 * Everything is positioned in absolute points so the boxes line up exactly.
 * The tunables below are the only values that need changing to match a
 * different printed form — column widths, row heights and the fixed budget
 * reserved for the panels under the goods table.
 */

// ---- page geometry --------------------------------------------------------
const PAGE = { width: 595.28, height: 841.89 };
const M = 28;
const L = M;
const W = PAGE.width - M * 2; // 539.28
const R = L + W;
const BOTTOM = PAGE.height - M;

// Heights of the stacked panels below the goods table. The Total row is placed
// so that everything after it lands exactly at the page's bottom margin.
const PANEL = Object.freeze({
  amountInWords: 30,
  taxSummary: 58,
  taxAmountInWords: 22,
  paymentSummary: 46,
  declarationAndBank: 72,
  signatures: 50,
  footer: 24,
});

const LOWER_HEIGHT = Object.values(PANEL).reduce((sum, height) => sum + height, 0);

// Main goods table columns, left to right. Widths add up to W.
const COLS = [
  { key: 'sl', label: 'Sl\nNo.', width: 28, align: 'center' },
  { key: 'description', label: 'Description of Goods', width: 200, align: 'left' },
  { key: 'hsn', label: 'HSN/SAC', width: 60, align: 'center' },
  { key: 'gstRate', label: 'GST\nRate', width: 50, align: 'center' },
  { key: 'quantity', label: 'Quantity', width: 60, align: 'right' },
  { key: 'rate', label: 'Rate', width: 55.28, align: 'right' },
  { key: 'per', label: 'per', width: 30, align: 'center' },
  { key: 'amount', label: 'Amount', width: 56, align: 'right' },
];

const PAD = 3;

// ---- drawing primitives ---------------------------------------------------
function rect(doc, x, y, w, h) {
  doc.lineWidth(0.6).strokeColor('#000000').rect(x, y, w, h).stroke();
}

function hLine(doc, x1, x2, y) {
  doc.lineWidth(0.6).strokeColor('#000000').moveTo(x1, y).lineTo(x2, y).stroke();
}

function vLine(doc, x, y1, y2) {
  doc.lineWidth(0.6).strokeColor('#000000').moveTo(x, y1).lineTo(x, y2).stroke();
}

/** Small grey caption, e.g. "Invoice No." */
function caption(doc, text, x, y, w) {
  doc.font('Helvetica').fontSize(6.5).fillColor('#444444')
    .text(text, x + PAD, y + 2, { width: w - PAD * 2, lineBreak: false });
}

/** Field value under a caption. */
function value(doc, text, x, y, w, { bold = false, size = 8.5, align = 'left' } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000000')
    .text(text ?? '', x + PAD, y, { width: w - PAD * 2, align });
}

/** Caption on the first line, value on the second — the standard Tally cell. */
function field(doc, x, y, w, label, text, opts = {}) {
  caption(doc, label, x, y, w);
  value(doc, text || '', x, y + 10.5, w, { bold: true, ...opts });
}

function cell(doc, text, x, y, w, { align = 'left', bold = false, size = 8.5, color = '#000000' } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color)
    .text(text ?? '', x + PAD, y, { width: w - PAD * 2, align });
}

// ---- formatting -----------------------------------------------------------
const NUMBER_FORMAT = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function amount(value) {
  const parsed = Number(value ?? 0);
  return NUMBER_FORMAT.format(Number.isFinite(parsed) ? parsed : 0);
}

function qty(value) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN').format(Number.isFinite(parsed) ? parsed : 0);
}

function percent(value) {
  const parsed = Number(value ?? 0);
  return `${Number.isInteger(parsed) ? parsed : parsed.toFixed(2)}%`;
}

/** dd-MMM-yy, the format used on the printed invoice. */
function invoiceDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

const METHOD_LABELS = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other',
};

function methodLabel(method) {
  if (!method) return '—';
  return METHOD_LABELS[method] ?? String(method).replace(/_/g, ' ');
}

// ---- sections -------------------------------------------------------------

/** Title strip: "TAX INVOICE" centred, "ORIGINAL FOR RECIPIENT" on the right. */
function drawTitle(doc, y) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
    .text('TAX INVOICE', L, y, { width: W, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor('#000000')
    .text('ORIGINAL FOR RECIPIENT', L, y + 2, { width: W, align: 'right' });
  return y + 16;
}

/**
 * Seller + buyer blocks on the left, with the invoice reference grid on the
 * right. Returns the y coordinate below the block.
 */
function drawHeader(doc, y, { company, customer, order, bill }) {
  const leftW = 300;
  const rightX = L + leftW;
  const rightW = W - leftW;
  const halfW = rightW / 2;
  const rowH = 28;
  const sellerH = rowH * 3; // 84
  const buyerH = rowH * 3 + 24; // 108
  const totalH = sellerH + buyerH;

  rect(doc, L, y, W, totalH);
  vLine(doc, rightX, y, y + totalH);
  hLine(doc, L, R, y + sellerH);

  // --- seller ---
  let sy = y + 4;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
    .text(company.name, L + PAD + 2, sy, { width: leftW - 10 });
  sy = doc.y + 1;
  doc.font('Helvetica').fontSize(7.5).fillColor('#000000')
    .text(company.address || '', L + PAD + 2, sy, { width: leftW - 10 });
  sy = doc.y;
  const sellerLines = [
    company.phone ? `Phone: ${company.phone}` : null,
    company.gstin ? `GSTIN/UIN: ${company.gstin}` : null,
    company.state ? `State Name: ${company.state}, Code: ${company.stateCode || ''}` : null,
    company.email ? `E-Mail: ${company.email}` : null,
  ].filter(Boolean);
  doc.fontSize(7.5).text(sellerLines.join('\n'), L + PAD + 2, sy, { width: leftW - 10 });

  // --- buyer ---
  const by = y + sellerH;
  let byy = by + 3;
  caption(doc, 'Buyer (Bill to)', L, by, leftW);
  byy = by + 12;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000')
    .text(customer.name || '', L + PAD + 2, byy, { width: leftW - 10 });
  byy = doc.y + 1;
  doc.font('Helvetica').fontSize(7.5)
    .text(customer.address || '', L + PAD + 2, byy, { width: leftW - 10 });
  byy = doc.y;
  const buyerLines = [
    customer.phone ? `Phone: ${customer.phone}` : null,
    customer.gstin ? `GSTIN/UIN: ${customer.gstin}` : null,
    customer.state ? `State Name: ${customer.state}, Code: ${customer.stateCode || ''}` : null,
  ].filter(Boolean);
  doc.fontSize(7.5).text(buyerLines.join('\n'), L + PAD + 2, byy, { width: leftW - 10 });

  // --- reference grid (right) ---
  const grid = [
    [['Invoice No.', order.invoiceNumber], ['Dated', invoiceDate(order.date)]],
    [['Delivery Note', order.deliveryNote], ['Mode/Terms of Payment', order.paymentTerms]],
    [['Reference No. & Date', order.referenceNo], ['Other References', order.otherReferences]],
    [["Buyer's Order No.", order.buyerOrderNo], ['Dated', invoiceDate(order.buyerOrderDate)]],
    [['Dispatch Doc No.', order.dispatchDocNo], ['Delivery Note Date', invoiceDate(order.deliveryNoteDate)]],
    [['Dispatched through', order.dispatchedThrough], ['Destination', order.destination]],
  ];

  grid.forEach((row, index) => {
    const ry = y + index * rowH;
    if (index > 0) hLine(doc, rightX, R, ry);
    vLine(doc, rightX + halfW, ry, ry + rowH);
    field(doc, rightX, ry, halfW, row[0][0], row[0][1], { size: index === 0 ? 9.5 : 8.5 });
    field(doc, rightX + halfW, ry, halfW, row[1][0], row[1][1], { size: index === 0 ? 9.5 : 8.5 });
  });

  const termsY = y + rowH * 6;
  hLine(doc, rightX, R, termsY);
  field(doc, rightX, termsY, rightW, 'Terms of Delivery', bill.termsOfDelivery);

  return y + totalH;
}

/** Column x offsets for the goods table. */
function columnOffsets() {
  const offsets = [];
  let x = L;
  for (const col of COLS) {
    offsets.push(x);
    x += col.width;
  }
  return offsets;
}

/**
 * Goods table: header, one row per charged line (product, delivery…), the
 * CGST/SGST tax lines and the Total row. `bodyBottom` fixes where the Total row
 * sits so the lower half of the invoice always lands in the same place.
 */
function drawGoodsTable(doc, y, { lines, gst, totalQuantityLabel, bodyBottom }) {
  const offsets = columnOffsets();
  const headerH = 22;

  rect(doc, L, y, W, headerH);
  COLS.forEach((col, i) => {
    if (i > 0) vLine(doc, offsets[i], y, y + headerH);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000')
      .text(col.label, offsets[i] + PAD, y + 4, {
        width: col.width - PAD * 2,
        align: col.align === 'right' ? 'center' : col.align,
      });
  });

  const bodyTop = y + headerH;
  const totalRowH = 18;
  const totalTop = bodyBottom - totalRowH;

  // Body frame with the column separators running its full height.
  rect(doc, L, bodyTop, W, bodyBottom - bodyTop);
  COLS.forEach((_, i) => {
    if (i > 0) vLine(doc, offsets[i], bodyTop, bodyBottom);
  });

  const at = (key) => offsets[COLS.findIndex((c) => c.key === key)];
  const widthOf = (key) => COLS.find((c) => c.key === key).width;

  // --- charged lines ---
  let ry = bodyTop + 5;
  lines.forEach((line, index) => {
    cell(doc, String(index + 1), at('sl'), ry, widthOf('sl'), { align: 'center' });
    cell(doc, line.description, at('description'), ry, widthOf('description'), { bold: true });
    let descBottom = doc.y;
    for (const note of [line.subText].filter(Boolean)) {
      doc.font('Helvetica').fontSize(7).fillColor('#333333')
        .text(note, at('description') + PAD, descBottom + 1, {
          width: widthOf('description') - PAD * 2,
        });
      descBottom = doc.y;
    }
    cell(doc, line.hsn || '', at('hsn'), ry, widthOf('hsn'), { align: 'center' });
    cell(doc, percent(gst.gstRate), at('gstRate'), ry, widthOf('gstRate'), { align: 'center' });
    if (line.quantity != null) {
      cell(doc, qty(line.quantity), at('quantity'), ry, widthOf('quantity'), { align: 'right' });
      cell(doc, amount(line.rate), at('rate'), ry, widthOf('rate'), { align: 'right' });
      cell(doc, line.unit || 'Nos', at('per'), ry, widthOf('per'), { align: 'center' });
    }
    cell(doc, amount(line.amount), at('amount'), ry, widthOf('amount'), { align: 'right', bold: true });

    ry = Math.max(descBottom, doc.y) + 6;
  });

  // --- sub total + tax lines, pushed down so they sit just above the Total row ---
  ry = totalTop - 46;
  hLine(doc, at('description'), R, ry - 3);
  cell(doc, 'Sub Total (taxable value)', at('description'), ry, widthOf('description'), {
    align: 'right', bold: true,
  });
  cell(doc, amount(gst.taxableValue), at('amount'), ry, widthOf('amount'), { align: 'right', bold: true });

  ry = totalTop - 30;
  cell(doc, 'CGST', at('description'), ry, widthOf('description'), { align: 'right' });
  cell(doc, percent(gst.cgstRate), at('gstRate'), ry, widthOf('gstRate'), { align: 'center' });
  cell(doc, amount(gst.cgstAmount), at('amount'), ry, widthOf('amount'), { align: 'right' });

  ry += 13;
  cell(doc, 'SGST/UTGST', at('description'), ry, widthOf('description'), { align: 'right' });
  cell(doc, percent(gst.sgstRate), at('gstRate'), ry, widthOf('gstRate'), { align: 'center' });
  cell(doc, amount(gst.sgstAmount), at('amount'), ry, widthOf('amount'), { align: 'right' });

  // --- total row ---
  hLine(doc, L, R, totalTop);
  cell(doc, 'Total', at('description'), totalTop + 5, widthOf('description'), {
    align: 'right', bold: true, size: 9,
  });
  cell(doc, totalQuantityLabel, at('quantity'), totalTop + 5, widthOf('quantity'), {
    align: 'right', bold: true, size: 8.5,
  });
  cell(doc, amount(gst.grandTotal), at('amount'), totalTop + 5, widthOf('amount'), {
    align: 'right', bold: true, size: 9,
  });

  return bodyBottom;
}

/** "Amount Chargeable (in words)" band with the E. & O.E. note. */
function drawAmountInWords(doc, y, total) {
  const h = PANEL.amountInWords;
  rect(doc, L, y, W, h);
  caption(doc, 'Amount Chargeable (in words)', L, y, W - 60);
  doc.font('Helvetica').fontSize(6.5).fillColor('#444444')
    .text('E. & O.E', R - 60, y + 2, { width: 55, align: 'right' });
  value(doc, amountInWords(total), L, y + 11, W - 10, { bold: true, size: 9 });
  return y + h;
}

/** HSN-wise tax summary with its own total row. */
function drawTaxSummary(doc, y, { hsn, gst }) {
  const widths = [90, 90, 55, 72, 55, 72, 105.28];
  const offsets = [];
  let x = L;
  for (const w of widths) {
    offsets.push(x);
    x += w;
  }

  const topH = 12;
  const subH = 14;
  const rowH = 16;
  const totalH = 16;
  const headerBottom = y + topH + subH;

  rect(doc, L, y, W, topH + subH + rowH + totalH);

  // Grouped header: Central Tax / State Tax each span a rate + amount column.
  hLine(doc, L, R, headerBottom);
  hLine(doc, offsets[2], offsets[6], y + topH);
  [1, 2, 4, 6].forEach((i) => vLine(doc, offsets[i], y, headerBottom));
  [3, 5].forEach((i) => vLine(doc, offsets[i], y + topH, headerBottom));

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000');
  doc.text('HSN/SAC', offsets[0] + PAD, y + 8, { width: widths[0] - PAD * 2, align: 'center' });
  doc.text('Taxable\nValue', offsets[1] + PAD, y + 3, { width: widths[1] - PAD * 2, align: 'center' });
  doc.text('Central Tax', offsets[2] + PAD, y + 2.5, { width: widths[2] + widths[3] - PAD * 2, align: 'center' });
  doc.text('State/UT Tax', offsets[4] + PAD, y + 2.5, { width: widths[4] + widths[5] - PAD * 2, align: 'center' });
  doc.text('Total\nTax Amount', offsets[6] + PAD, y + 3, { width: widths[6] - PAD * 2, align: 'center' });
  doc.fontSize(7);
  doc.text('Rate', offsets[2] + PAD, y + topH + 4, { width: widths[2] - PAD * 2, align: 'center' });
  doc.text('Amount', offsets[3] + PAD, y + topH + 4, { width: widths[3] - PAD * 2, align: 'center' });
  doc.text('Rate', offsets[4] + PAD, y + topH + 4, { width: widths[4] - PAD * 2, align: 'center' });
  doc.text('Amount', offsets[5] + PAD, y + topH + 4, { width: widths[5] - PAD * 2, align: 'center' });

  // Data row.
  const rowY = headerBottom;
  hLine(doc, L, R, rowY + rowH);
  [1, 2, 3, 4, 5, 6].forEach((i) => vLine(doc, offsets[i], rowY, rowY + rowH + totalH));

  const rowCells = [
    [hsn || '', 'center'],
    [amount(gst.taxableValue), 'right'],
    [percent(gst.cgstRate), 'center'],
    [amount(gst.cgstAmount), 'right'],
    [percent(gst.sgstRate), 'center'],
    [amount(gst.sgstAmount), 'right'],
    [amount(gst.totalTax), 'right'],
  ];
  rowCells.forEach(([text, align], i) => {
    cell(doc, text, offsets[i], rowY + 4.5, widths[i], { align, size: 8 });
  });

  // Total row.
  const totalY = rowY + rowH;
  cell(doc, 'Total', offsets[0], totalY + 4.5, widths[0], { align: 'right', bold: true, size: 8 });
  cell(doc, amount(gst.taxableValue), offsets[1], totalY + 4.5, widths[1], { align: 'right', bold: true, size: 8 });
  cell(doc, amount(gst.cgstAmount), offsets[3], totalY + 4.5, widths[3], { align: 'right', bold: true, size: 8 });
  cell(doc, amount(gst.sgstAmount), offsets[5], totalY + 4.5, widths[5], { align: 'right', bold: true, size: 8 });
  cell(doc, amount(gst.totalTax), offsets[6], totalY + 4.5, widths[6], { align: 'right', bold: true, size: 8 });

  const bottom = totalY + totalH;

  // Tax amount in words.
  const wordsH = PANEL.taxAmountInWords;
  rect(doc, L, bottom, W, wordsH);
  caption(doc, 'Tax Amount (in words)', L, bottom, 100);
  value(doc, amountInWords(gst.totalTax), L + 100, bottom + 6, W - 105, { bold: true, size: 8.5 });

  return bottom + wordsH;
}

/** Payment status band: what has been received against this invoice. */
function drawPaymentSummary(doc, y, { grandTotal, paid, outstanding, payments }) {
  const h = PANEL.paymentSummary;
  rect(doc, L, y, W, h);
  caption(doc, 'Payment Details', L, y, W);

  const colW = W / 3;
  vLine(doc, L + colW, y + 11, y + h);
  vLine(doc, L + colW * 2, y + 11, y + h);

  const stat = (label, text, index, bold) => {
    const x = L + colW * index;
    doc.font('Helvetica').fontSize(6.5).fillColor('#444444')
      .text(label, x + PAD + 2, y + 15, { width: colW - PAD * 2 });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000000')
      .text(text, x + PAD + 2, y + 24, { width: colW - PAD * 2 });
  };
  stat('Invoice Total', amount(grandTotal), 0, true);
  stat('Amount Paid', amount(paid), 1, true);
  stat('Outstanding', amount(outstanding), 2, true);

  const recent = (payments ?? []).slice(-3)
    .map((p) => `${invoiceDate(p.payment_date)} ${methodLabel(p.payment_method)} ${amount(p.amount)}`)
    .join('   |   ');
  doc.font('Helvetica').fontSize(6.5).fillColor('#333333')
    .text(recent || 'No payments received yet', L + PAD + 2, y + 36, { width: W - 10 });

  return y + h;
}

/** Declaration on the left, company bank details on the right. */
function drawDeclarationAndBank(doc, y, { company }) {
  const h = PANEL.declarationAndBank;
  const leftW = W * 0.55;
  rect(doc, L, y, W, h);
  vLine(doc, L + leftW, y, y + h);

  caption(doc, 'Declaration', L, y, leftW);
  doc.font('Helvetica').fontSize(7).fillColor('#000000')
    .text(company.declaration, L + PAD + 2, y + 13, { width: leftW - 10 });

  const bankX = L + leftW;
  const bankW = W - leftW;
  caption(doc, "Company's Bank Details", bankX, y, bankW);
  const bankRows = [
    ["A/c Holder's Name", company.bankAccountName],
    ['Bank Name', company.bankName],
    ['A/c No.', company.bankAccountNumber],
    ['Branch & IFS Code', company.bankBranchIfsc],
  ];
  bankRows.forEach(([label, text], i) => {
    const ry = y + 13 + i * 14;
    doc.font('Helvetica').fontSize(7).fillColor('#444444')
      .text(`${label} :`, bankX + PAD + 2, ry, { width: 78, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000')
      .text(text || '—', bankX + PAD + 82, ry, { width: bankW - 90, lineBreak: false });
  });

  return y + h;
}

/** Customer seal box on the left, authorised signatory on the right. */
function drawSignatures(doc, y, { company }) {
  const h = PANEL.signatures;
  const leftW = W * 0.55;
  rect(doc, L, y, W, h);
  vLine(doc, L + leftW, y, y + h);

  doc.font('Helvetica').fontSize(7.5).fillColor('#000000')
    .text("Customer's Seal and Signature", L + PAD + 2, y + h - 12, { width: leftW - 10 });

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000')
    .text(`for ${company.name}`, L + leftW + PAD, y + 5, { width: W - leftW - 10, align: 'right' });
  doc.font('Helvetica').fontSize(7.5)
    .text('Authorised Signatory', L + leftW + PAD, y + h - 12, { width: W - leftW - 10, align: 'right' });

  return y + h;
}

function drawFooter(doc, y, { company }) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000')
    .text(`SUBJECT TO ${String(company.jurisdiction || 'BENGALURU').toUpperCase()} JURISDICTION`, L, y + 3, {
      width: W, align: 'center',
    });
  doc.font('Helvetica').fontSize(7).fillColor('#333333')
    .text('This is a Computer Generated Invoice', L, y + 13, { width: W, align: 'center' });
}

// ---- entry point ----------------------------------------------------------

/**
 * @param {object} params
 * @param {object} params.order    Order row joined with its customer columns.
 * @param {object} params.bill     Matching bills row (may be null for drafts).
 * @param {object} params.company  Seller details from settings.
 * @param {Array}  params.payments Payment rows for this order.
 * @returns {Promise<Buffer>} the rendered PDF.
 */
export function buildTaxInvoicePdf({ order, bill = null, company, payments = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const quantity = Number(order.quantity ?? 1) || 1;
    const gst = computeGstBreakdown({
      total: Number(order.total_amount ?? 0),
      gstRate: bill?.gst_rate ?? order.gst_rate,
      quantity,
      deliveryCharge: Number(order.delivery_charge ?? 0),
      cuttingCharge: Number(order.cutting_charge ?? 0),
    });

    const invoiceNumber = order.order_number || bill?.bill_number || `DRAFT-${order.id}`;
    const date = order.order_date || bill?.invoice_date || order.created_at;
    const paid = Number(order.paid_amount ?? 0);
    const outstanding = Math.max(0, Number(order.balance_amount ?? gst.grandTotal - paid));

    const descriptionParts = [
      order.size ? `Size: ${order.size}` : null,
      order.production_type ? `${order.production_type === 'offset' ? 'Offset' : 'Digital'} printing` : null,
      order.category_name ? `Category: ${order.category_name}` : null,
      order.special_instructions || null,
    ].filter(Boolean);

    const unit = order.unit || 'Nos';

    const lines = [
      {
        description: order.product_name,
        subText: descriptionParts.join(' · '),
        hsn: order.hsn_code,
        quantity,
        unit,
        rate: gst.ratePerUnit,
        amount: gst.itemTaxable,
      },
    ];

    if (gst.deliveryTotal > 0) {
      lines.push({
        description: 'Delivery / Freight charges',
        hsn: '',
        amount: gst.deliveryTaxable,
      });
    }

    if (gst.cuttingTotal > 0) {
      lines.push({
        description: 'Cutting charges',
        hsn: '',
        amount: gst.cuttingTaxable,
      });
    }

    let y = drawTitle(doc, M);

    y = drawHeader(doc, y, {
      company,
      customer: {
        name: order.customer_company || order.customer_name,
        address: [order.customer_name && order.customer_company ? order.customer_name : null, order.customer_address]
          .filter(Boolean).join('\n'),
        phone: order.customer_phone,
        gstin: order.customer_gst,
        state: order.customer_state,
        stateCode: order.customer_state_code,
      },
      order: {
        invoiceNumber,
        date,
        deliveryNote: '',
        paymentTerms: outstanding > 0 ? 'Credit' : 'Paid',
        referenceNo: '',
        otherReferences: '',
        buyerOrderNo: '',
        buyerOrderDate: null,
        dispatchDocNo: '',
        deliveryNoteDate: null,
        dispatchedThrough: order.dispatched_through || '',
        destination: order.customer_state || '',
      },
      bill: { termsOfDelivery: '' },
    });

    // Fixed budget for everything below the goods table, so the Total row and
    // the summary panels always land at the same height on the page.
    y = drawGoodsTable(doc, y, {
      lines,
      gst,
      totalQuantityLabel: `${qty(quantity)} ${unit}`,
      bodyBottom: BOTTOM - LOWER_HEIGHT,
    });

    y = drawAmountInWords(doc, y, gst.grandTotal);
    y = drawTaxSummary(doc, y, { hsn: order.hsn_code, gst });
    y = drawPaymentSummary(doc, y, {
      grandTotal: gst.grandTotal, paid, outstanding, payments,
    });
    y = drawDeclarationAndBank(doc, y, { company });
    y = drawSignatures(doc, y, { company });
    drawFooter(doc, y, { company });

    doc.end();
  });
}
