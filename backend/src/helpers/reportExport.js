import PDFDocument from 'pdfkit';

/**
 * Renders the orders report in the format the user picked on the Reports page.
 *
 * CSV and Excel share one column definition so the three downloads always
 * carry the same data. Excel is written as SpreadsheetML 2003 (an XML dialect
 * Excel opens natively) rather than a real .xlsx, which keeps the export
 * dependency-free while still producing a genuine spreadsheet with typed
 * numeric cells — a renamed CSV would not.
 */

// [header label, row key, type] — 'number' cells are written unformatted so
// Excel can sum them.
export const EXPORT_COLUMNS = [
  ['Date', 'invoice_date', 'text'],
  ['Invoice No.', 'invoice_no', 'text'],
  ['Customer', 'customer_name', 'text'],
  ['Company', 'company_name', 'text'],
  ['Phone', 'customer_phone', 'text'],
  ['Customer GSTIN', 'customer_gst', 'text'],
  ['Item', 'product_name', 'text'],
  ['Category', 'category', 'text'],
  ['HSN/SAC', 'hsn_code', 'text'],
  ['Size', 'size', 'text'],
  ['Qty', 'quantity', 'number'],
  ['Unit', 'unit', 'text'],
  ['Rate', 'rate_per_unit', 'number'],
  ['Taxable Value', 'taxable_value', 'number'],
  ['GST %', 'gst_rate', 'number'],
  ['CGST', 'cgst_amount', 'number'],
  ['SGST', 'sgst_amount', 'number'],
  ['Delivery Charge', 'delivery_charge', 'number'],
  ['Cutting Charge', 'cutting_charge', 'number'],
  ['Dispatched Through', 'dispatched_through', 'text'],
  ['Wastage Item', 'wastage_item', 'text'],
  ['Wastage Qty', 'wastage_quantity', 'number'],
  ['Cutting / Finishing', 'cutting', 'text'],
  ['Total', 'total_amount', 'number'],
  ['Paid', 'paid_amount', 'number'],
  ['Balance', 'balance_amount', 'number'],
  ['Payment', 'payment_status', 'text'],
  ['Status', 'status', 'text'],
];


export const EXPORT_FORMATS = ['csv', 'excel', 'pdf'];

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---- CSV ------------------------------------------------------------------

/** Quotes a value for CSV and neutralises spreadsheet formula injection. */
function csvCell(value) {
  if (isBlank(value)) return '""';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildCsv(rows) {
  const header = EXPORT_COLUMNS.map(([label]) => csvCell(label)).join(',');
  const body = rows
    .map((row) => EXPORT_COLUMNS.map(([, key]) => csvCell(row[key])).join(','))
    .join('\r\n');
  // BOM so Excel opens UTF-8 correctly.
  return `\uFEFF${body ? `${header}\r\n${body}` : header}`;
}

// ---- Excel (SpreadsheetML 2003) -------------------------------------------

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters are illegal in XML and would make Excel reject the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function excelCell(value, type) {
  if (isBlank(value)) return '<Cell><Data ss:Type="String"></Data></Cell>';
  if (type === 'number') {
    const parsed = numeric(value);
    if (parsed !== null) return `<Cell><Data ss:Type="Number">${parsed}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

export function buildExcel(rows, { title = 'Orders report' } = {}) {
  const header = EXPORT_COLUMNS.map(
    ([label]) => `<Cell ss:StyleID="head"><Data ss:Type="String">${xmlEscape(label)}</Data></Cell>`,
  ).join('');

  const body = rows
    .map(
      (row) =>
        `<Row>${EXPORT_COLUMNS.map(([, key, type]) => excelCell(row[key], type)).join('')}</Row>`,
    )
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="head">
   <Font ss:Bold="1"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(title).slice(0, 31)}">
  <Table>
   <Row>${header}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
}

// ---- PDF ------------------------------------------------------------------

const PDF_MARGIN = 28;
const PAGE_OPTIONS = { size: 'A4', layout: 'landscape', margin: PDF_MARGIN, bufferPages: true };
const ROW_HEIGHT = 17;
const HEADER_HEIGHT = 22;

const COLORS = {
  primary: '#1e3a8a',
  accent: '#0ea5e9',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#cbd5e1',
  zebra: '#f1f5f9',
  totalFill: '#dbeafe',
  green: '#15803d',
  red: '#dc2626',
};

const MONEY_FORMAT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function inr(value) {
  return MONEY_FORMAT.format(numeric(value) ?? 0);
}

function gstOf(row) {
  return (numeric(row.cgst_amount) ?? 0) + (numeric(row.sgst_amount) ?? 0);
}

/** YYYY-MM-DD -> DD-Mon-YY, matching the printed tax invoice. */
function shortDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return isBlank(value) ? '' : String(value);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${match[3]}-${months[Number(match[2]) - 1]}-${match[1].slice(2)}`;
}

// Columns are sized to their content; `flex` columns share whatever width is left.
const PDF_COLUMNS = [
  { label: 'Date', value: (r) => shortDate(r.invoice_date) },
  { label: 'Invoice No.', value: (r) => r.invoice_no },
  { label: 'Customer', flex: true, value: (r) => r.company_name || r.customer_name },
  { label: 'Item', flex: true, value: (r) => r.product_name },
  { label: 'Qty', align: 'right', value: (r) => r.quantity },
  { label: 'Taxable', money: true, key: 'taxable', value: (r) => r.taxable_value },
  { label: 'GST', money: true, key: 'gst', value: gstOf },
  { label: 'Delivery', money: true, key: 'delivery', value: (r) => r.delivery_charge },
  { label: 'Cutting', money: true, key: 'cutting', value: (r) => r.cutting_charge },
  { label: 'Total', money: true, key: 'total', bold: true, value: (r) => r.total_amount },
  { label: 'Paid', money: true, key: 'paid', value: (r) => r.paid_amount },
  { label: 'Balance', money: true, key: 'balance', value: (r) => r.balance_amount },
];

const CELL_PADDING = 10;
const FLEX_MIN = 60;
const FLEX_MAX = 170;

function contentWidth(doc) {
  return doc.page.width - PDF_MARGIN * 2;
}

/** Widest rendered line in a column, including its header and the totals row. */
function naturalWidth(doc, col, rows, sums) {
  doc.fontSize(7.5).font('Helvetica-Bold');
  let widest = doc.widthOfString(col.label);
  const measure = (text, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    for (const line of String(text).split(/\r?\n/)) {
      widest = Math.max(widest, doc.widthOfString(line.replace(/\s+/g, ' ').trim()));
    }
  };
  for (const row of rows) {
    const raw = col.value(row);
    if (!isBlank(raw)) measure(col.money ? inr(raw) : raw, col.bold || col.key === 'balance');
  }
  if (col.key) measure(inr(sums[col.key]), true);
  return Math.ceil(widest) + CELL_PADDING;
}

function scaledColumns(doc, rows, sums) {
  const widths = PDF_COLUMNS.map((col, i) => {
    const natural = naturalWidth(doc, col, rows, sums);
    return PDF_COLUMNS[i].flex ? Math.min(natural, FLEX_MAX) : natural;
  });
  const fixed = widths.reduce((sum, w, i) => (PDF_COLUMNS[i].flex ? sum : sum + w), 0);
  const flexNatural = widths.reduce((sum, w, i) => (PDF_COLUMNS[i].flex ? sum + w : sum), 0);
  // Only squeeze the text columns (they wrap) when everything cannot fit the page.
  const factor = Math.min(1, (contentWidth(doc) - fixed) / (flexNatural || 1));
  const final = widths.map((w, i) => (PDF_COLUMNS[i].flex ? Math.max(FLEX_MIN, w * factor) : w));
  const tableWidth = final.reduce((sum, w) => sum + w, 0);

  let x = PDF_MARGIN + Math.max(0, (contentWidth(doc) - tableWidth) / 2);
  return PDF_COLUMNS.map((col, i) => {
    const scaled = { ...col, x, width: final[i], align: col.align ?? (col.money ? 'right' : 'left') };
    x += final[i];
    return scaled;
  });
}

function tableLeft(columns) {
  return columns[0].x;
}

function tableWidth(columns) {
  const last = columns[columns.length - 1];
  return last.x + last.width - columns[0].x;
}

function summarise(rows) {
  const sums = { taxable: 0, gst: 0, delivery: 0, cutting: 0, total: 0, paid: 0, balance: 0 };
  const status = { paid: 0, partial: 0, unpaid: 0 };
  for (const row of rows) {
    for (const col of PDF_COLUMNS) {
      if (col.key) sums[col.key] += numeric(col.value(row)) ?? 0;
    }
    if (row.payment_status in status) status[row.payment_status] += 1;
  }
  return { sums, status, count: rows.length };
}

/** Full-width coloured band with the company identity and report title. */
function drawCompanyBand(doc, company, { title, subtitle, generatedAt }) {
  const pageW = doc.page.width;
  const bandH = 96;
  doc.save().rect(0, 0, pageW, bandH).fill(COLORS.primary).restore();
  doc.save().rect(0, bandH, pageW, 4).fill(COLORS.accent).restore();

  const leftW = pageW * 0.58 - PDF_MARGIN;
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#ffffff')
    .text(company.name || 'Company', PDF_MARGIN, 18, { width: leftW, lineBreak: false, ellipsis: true });

  const details = [
    company.address ? String(company.address).replace(/\s*\n\s*/g, ', ') : null,
    [company.phone && `Phone: ${company.phone}`, company.email && `Email: ${company.email}`]
      .filter(Boolean).join('    |    '),
    [
      company.gstin && `GSTIN: ${company.gstin}`,
      company.state && `State: ${company.state}${company.stateCode ? ` (Code ${company.stateCode})` : ''}`,
    ].filter(Boolean).join('    |    '),
  ].filter(Boolean);

  doc.font('Helvetica').fontSize(8.5).fillColor('#dbeafe');
  details.forEach((line, i) => {
    doc.text(line, PDF_MARGIN, 48 + i * 12, { width: leftW, lineBreak: false, ellipsis: true });
  });

  const rx = pageW * 0.6;
  const rw = pageW - PDF_MARGIN - rx;
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff')
    .text(title.toUpperCase(), rx, 20, { width: rw, align: 'right', characterSpacing: 1.2, lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#bfdbfe');
  if (subtitle) doc.text(subtitle, rx, 48, { width: rw, align: 'right', lineBreak: false });
  doc.text(`Generated on ${generatedAt}`, rx, 62, { width: rw, align: 'right', lineBreak: false });

  return bandH + 4 + 16;
}

/** Slim band repeated on continuation pages. */
function drawContinuationBand(doc, company, title) {
  const pageW = doc.page.width;
  const bandH = 30;
  doc.save().rect(0, 0, pageW, bandH).fill(COLORS.primary).restore();
  doc.save().rect(0, bandH, pageW, 2).fill(COLORS.accent).restore();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
    .text(company.name || 'Company', PDF_MARGIN, 10, { width: 400, lineBreak: false, ellipsis: true });
  doc.font('Helvetica').fontSize(9).fillColor('#bfdbfe')
    .text(`${title} (continued)`, PDF_MARGIN, 11, { width: contentWidth(doc), align: 'right', lineBreak: false });
  return bandH + 2 + 14;
}

function sectionHeading(doc, text, y) {
  doc.save().rect(PDF_MARGIN, y, 4, 15).fill(COLORS.accent).restore();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary)
    .text(text, PDF_MARGIN + 10, y + 1.5, { lineBreak: false });
  return y + 24;
}

/** Shrinks the font until `text` fits `width`. */
function fitText(doc, text, width, start, min = 8, font = 'Helvetica-Bold') {
  let size = start;
  doc.font(font);
  while (size > min && doc.fontSize(size).widthOfString(text) > width) size -= 0.5;
  return size;
}

function drawSummaryCards(doc, y, cards) {
  const gap = 10;
  const w = (contentWidth(doc) - gap * (cards.length - 1)) / cards.length;
  const h = 62;

  cards.forEach((card, i) => {
    const x = PDF_MARGIN + i * (w + gap);
    doc.save();
    doc.roundedRect(x, y, w, h, 6).clip();
    doc.rect(x, y, w, h).fill(card.tint);
    doc.rect(x, y, 5, h).fill(card.color);
    doc.restore();
    doc.save().lineWidth(0.6).strokeColor(card.color).roundedRect(x, y, w, h, 6).stroke().restore();

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.muted)
      .text(card.label.toUpperCase(), x + 13, y + 10, { width: w - 20, lineBreak: false, characterSpacing: 0.5 });
    const size = fitText(doc, card.value, w - 20, 15);
    doc.font('Helvetica-Bold').fontSize(size).fillColor(card.color)
      .text(card.value, x + 13, y + 24, { width: w - 20, lineBreak: false });
    const note = card.note ?? '';
    doc.font('Helvetica').fontSize(fitText(doc, note, w - 20, 7, 5.5, 'Helvetica')).fillColor(COLORS.muted)
      .text(note, x + 13, y + 46, { width: w - 20, lineBreak: false, ellipsis: true });
  });

  return y + h;
}

function drawCollectionBar(doc, y, { sales, collected, outstanding }) {
  const w = contentWidth(doc);
  const pct = sales > 0 ? Math.min(collected / sales, 1) : 0;

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.green)
    .text(`Collected ${(pct * 100).toFixed(1)}% of sales`, PDF_MARGIN, y, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.red)
    .text(`Outstanding Rs. ${inr(outstanding)}`, PDF_MARGIN, y, { width: w, align: 'right', lineBreak: false });

  const barY = y + 14;
  doc.save().roundedRect(PDF_MARGIN, barY, w, 8, 4).fill('#fee2e2').restore();
  if (pct > 0) doc.save().roundedRect(PDF_MARGIN, barY, Math.max(w * pct, 8), 8, 4).fill('#22c55e').restore();
  return barY + 8;
}

function columnLines(doc, columns, y, h, color, from = 1) {
  doc.save().lineWidth(0.5).strokeColor(color);
  for (const col of columns.slice(from)) doc.moveTo(col.x, y).lineTo(col.x, y + h);
  const left = tableLeft(columns);
  const right = left + tableWidth(columns);
  doc.moveTo(left, y).lineTo(left, y + h).moveTo(right, y).lineTo(right, y + h).stroke().restore();
}

function drawTableHeader(doc, y, columns) {
  doc.save().rect(tableLeft(columns), y, tableWidth(columns), HEADER_HEIGHT).fill(COLORS.primary).restore();
  columnLines(doc, columns, y, HEADER_HEIGHT, '#4f6fc7');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
  for (const col of columns) {
    doc.text(col.label, col.x + 4, y + 7.5, { width: col.width - 8, align: col.align, lineBreak: false });
  }
  return y + HEADER_HEIGHT;
}

function tableCells(doc, row, columns) {
  return columns.map((col) => {
    const raw = col.value(row);
    let color = COLORS.ink;
    let bold = Boolean(col.bold);
    if (col.key === 'balance') {
      const due = numeric(raw) ?? 0;
      color = due > 0 ? COLORS.red : COLORS.green;
      bold = due > 0;
    } else if (col.key === 'paid' && (numeric(raw) ?? 0) > 0) {
      color = COLORS.green;
    }
    const text = col.money
      ? inr(raw)
      : isBlank(raw) ? '' : String(raw).split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    const font = bold ? 'Helvetica-Bold' : 'Helvetica';
    const height = doc.font(font).fontSize(7.5).heightOfString(text || ' ', { width: col.width - 8 });
    return { col, text, color, font, height };
  });
}

/** Row height grows so long names wrap onto extra lines instead of being cut off. */
function rowHeight(cells) {
  return Math.max(ROW_HEIGHT, Math.ceil(Math.max(...cells.map((c) => c.height))) + 10);
}

function drawTableRow(doc, y, cells, index) {
  const h = rowHeight(cells);
  const columns = cells.map((c) => c.col);
  const left = tableLeft(columns);
  const width = tableWidth(columns);
  if (index % 2 === 1) doc.save().rect(left, y, width, h).fill(COLORS.zebra).restore();

  for (const { col, text, color, font } of cells) {
    doc.font(font).fontSize(7.5).fillColor(color)
      .text(text, col.x + 4, y + 5, { width: col.width - 8, align: col.align });
  }
  columnLines(doc, columns, y, h, COLORS.border);
  doc.lineWidth(0.4).strokeColor(COLORS.border)
    .moveTo(left, y + h).lineTo(left + width, y + h).stroke();
  return y + h;
}

function drawTotalsRow(doc, y, columns, { sums, count }) {
  const h = ROW_HEIGHT + 3;
  const left = tableLeft(columns);
  const width = tableWidth(columns);
  doc.save().rect(left, y, width, h).fill(COLORS.totalFill).restore();
  columnLines(doc, columns, y, h, '#93c5fd', 5);
  doc.save().lineWidth(0.8).strokeColor(COLORS.primary)
    .moveTo(left, y + h).lineTo(left + width, y + h).stroke().restore();
  doc.save().lineWidth(1).strokeColor(COLORS.primary)
    .moveTo(left, y).lineTo(left + width, y).stroke().restore();

  const labelWidth = columns[4].x + columns[4].width - left;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.primary)
    .text(`TOTAL (${count} invoice${count === 1 ? '' : 's'})`, left + 6, y + 6, { width: labelWidth - 10, lineBreak: false });
  for (const col of columns) {
    if (!col.key) continue;
    const color = col.key === 'balance' ? COLORS.red : col.key === 'paid' ? COLORS.green : COLORS.primary;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(color)
      .text(inr(sums[col.key]), col.x + 4, y + 6, { width: col.width - 8, align: 'right', lineBreak: false });
  }
  return y + h;
}

function drawFooters(doc, { company, title }) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Footer sits inside the bottom margin; lift it so pdfkit does not paginate.
    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = doc.page.height - 22;
    const w = contentWidth(doc);
    doc.lineWidth(0.6).strokeColor(COLORS.accent)
      .moveTo(PDF_MARGIN, y - 6).lineTo(PDF_MARGIN + w, y - 6).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
    doc.text(`${company.name || 'Company'}  ·  ${title}`, PDF_MARGIN, y, { width: w / 3, lineBreak: false });
    doc.text('Computer generated report', PDF_MARGIN + w / 3, y, { width: w / 3, align: 'center', lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, PDF_MARGIN + (w * 2) / 3, y, {
      width: w / 3, align: 'right', lineBreak: false,
    });

    doc.page.margins.bottom = originalBottom;
  }
}

/**
 * Renders the report as a branded landscape A4 document — company header,
 * summary cards, then the order table — and resolves with the PDF buffer.
 */
export function buildPdf(rows, { title = 'Orders Report', subtitle = '', company = {} } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument(PAGE_OPTIONS);
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const generatedAt = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
    });
    const bottom = doc.page.height - PDF_MARGIN - 20;
    const summary = summarise(rows);
    const { sums, status } = summary;
    const columns = scaledColumns(doc, rows, sums);

    let y = drawCompanyBand(doc, company, { title, subtitle, generatedAt });

    y = sectionHeading(doc, 'Summary', y);
    y = drawSummaryCards(doc, y, [
      {
        label: 'Invoices', value: String(summary.count), color: COLORS.primary, tint: '#eff6ff',
        note: `${status.paid} paid · ${status.partial} partial · ${status.unpaid} unpaid`,
      },
      { label: 'Total Sales', value: `Rs. ${inr(sums.total)}`, color: '#4f46e5', tint: '#eef2ff', note: 'GST inclusive' },
      {
        label: 'Collected', value: `Rs. ${inr(sums.paid)}`, color: COLORS.green, tint: '#f0fdf4',
        note: 'Payments received',
      },
      {
        label: 'Outstanding', value: `Rs. ${inr(sums.balance)}`, color: COLORS.red, tint: '#fef2f2',
        note: `${status.partial + status.unpaid} invoice(s) pending`,
      },
      {
        label: 'GST', value: `Rs. ${inr(sums.gst)}`, color: '#7c3aed', tint: '#f5f3ff',
        note: `Taxable Rs. ${inr(sums.taxable)}`,
      },
      {
        label: 'Delivery & Cutting', value: `Rs. ${inr(sums.delivery + sums.cutting)}`, color: '#0d9488', tint: '#f0fdfa',
        note: `Delivery ${inr(sums.delivery)} · Cutting ${inr(sums.cutting)}`,
      },
    ]);
    y = drawCollectionBar(doc, y + 14, { sales: sums.total, collected: sums.paid, outstanding: sums.balance });

    y = sectionHeading(doc, 'Order Details', y + 20);
    y = drawTableHeader(doc, y, columns);

    rows.forEach((row, index) => {
      const cells = tableCells(doc, row, columns);
      if (y + rowHeight(cells) > bottom) {
        doc.addPage(PAGE_OPTIONS);
        y = drawTableHeader(doc, drawContinuationBand(doc, company, title), columns);
      }
      y = drawTableRow(doc, y, cells, index);
    });

    if (rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted)
        .text('No orders in this period.', PDF_MARGIN, y + 10, { width: contentWidth(doc), align: 'center' });
    } else {
      if (y + ROW_HEIGHT + 3 > bottom) {
        doc.addPage(PAGE_OPTIONS);
        y = drawTableHeader(doc, drawContinuationBand(doc, company, title), columns);
      }
      drawTotalsRow(doc, y, columns, summary);
    }

    drawFooters(doc, { company, title });
    doc.end();
  });
}

/** Normalises the `format` query param to one of the supported formats. */
export function normalizeFormat(value) {
  const format = String(value ?? 'csv').trim().toLowerCase();
  if (format === 'xlsx' || format === 'xls') return 'excel';
  return EXPORT_FORMATS.includes(format) ? format : 'csv';
}
