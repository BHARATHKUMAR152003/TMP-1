import api, { unwrapWithMeta } from './api.js';

/** RECEIVED tab: individual payment transactions. */
export function listPayments(params = {}) {
  return unwrapWithMeta(api.get('/payments', { params }));
}

/** UNPAID tab: invoices still carrying an outstanding balance. */
export function listUnpaid(params = {}) {
  return unwrapWithMeta(api.get('/payments/unpaid', { params }));
}

export function recordPayment(payload) {
  const { screenshotFile, ...rest } = payload || {};
  if (screenshotFile) {
    const form = new FormData();
    Object.entries(rest).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') form.append(key, value);
    });
    form.append('paymentScreenshot', screenshotFile);
    return api.post('/payments', form).then((r) => r.data.data);
  }
  return api.post('/payments', rest).then((r) => r.data.data);
}

