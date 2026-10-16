import api, { unwrapWithMeta } from './api.js';

export function listInvoices(params = {}) {
  return unwrapWithMeta(api.get('/finance/invoices', { params }));
}

export function getInvoice(id) {
  return api.get(`/finance/invoices/${id}`).then((r) => r.data.data);
}

/** Invoices with an outstanding balance (the Payments › Unpaid tab). */
export function listOutstanding(params = {}) {
  return unwrapWithMeta(api.get('/finance/outstanding', { params }));
}

/** Bills / Invoices screen. Filterable across every financial year. */
export function listBills(params = {}) {
  return unwrapWithMeta(api.get('/finance/bills', { params }));
}

/** Financial-year options for the invoice and report filters. */
export function listFinancialYears() {
  return api.get('/finance/financial-years').then((r) => r.data.data);
}

export function cancelInvoice(orderId, reason) {
  return api.post(`/finance/orders/${orderId}/cancel`, { reason }).then((r) => r.data.data);
}

export function getReport(params = {}) {
  return api.get('/reports/summary', { params }).then((r) => r.data.data);
}

export function exportReport(params = {}) {
  return api.get('/reports/export', { params, responseType: 'blob' }).then((r) => r.data);
}

/** Triggers a browser download from a Blob response. */
function saveBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Downloads the tax invoice PDF. The invoice number contains slashes, so it is
 * sanitised before being used as a file name.
 */
export function downloadBill(orderId, ref) {
  const safeRef = String(ref || orderId).replace(/[/\\]/g, '-');
  return api
    .get(`/finance/orders/${orderId}/bill.pdf`, { responseType: 'blob' })
    .then((r) => saveBlob(r.data, `tax-invoice-${safeRef}.pdf`));
}

