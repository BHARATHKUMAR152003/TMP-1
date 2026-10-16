import api from './api.js';

export function getSettings() {
  return api.get('/settings').then((r) => r.data.data);
}

export function updateSettings(payload) {
  return api.put('/settings', payload).then((r) => r.data.data);
}

/** Company payment accounts (bank/UPI/QR) + note — readable by any signed-in user. */
export function getPaymentSettings() {
  return api.get('/settings/payment').then((r) => r.data.data);
}

/** Admin replaces the full list of payment accounts (+ optional instructions). */
export function updatePaymentAccounts(payload) {
  return api.put('/settings/payment-accounts', payload).then((r) => r.data.data);
}

/** Admin uploads a QR image; returns { path } to attach to an account. */
export function uploadPaymentQr(file) {
  const fd = new FormData();
  fd.append('qr', file);
  return api
    .post('/settings/payment-qr', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data.data);
}

/** Size rate card (A4/A3/A5…) — maintained by the admin and the accountant. */
export function getSizeRates() {
  return api.get('/settings/size-rates').then((r) => r.data.data);
}

export function updateSizeRates(rates) {
  return api.put('/settings/size-rates', { rates }).then((r) => r.data.data);
}
