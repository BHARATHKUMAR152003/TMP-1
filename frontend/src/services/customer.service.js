import api, { unwrapWithMeta } from './api.js';

export function listCustomers(params = {}) {
  return unwrapWithMeta(api.get('/customers', { params }));
}

/** Type-ahead for the order form, so existing customers get reused. */
export function searchCustomers(q) {
  return api.get('/customers/search', { params: { q } }).then((r) => r.data.data);
}

export function getCustomer(id) {
  return api.get(`/customers/${id}`).then((r) => r.data.data);
}

/**
 * Creates a customer. The API returns 409 when the details match an existing
 * record; pass allowDuplicate once the user has confirmed they really mean it.
 */
export function createCustomer(payload, { allowDuplicate = false } = {}) {
  return api
    .post('/customers', payload, { params: allowDuplicate ? { allowDuplicate: true } : undefined })
    .then((r) => r.data.data);
}

export function updateCustomer(id, payload) {
  return api.put(`/customers/${id}`, payload).then((r) => r.data.data);
}

/**
 * Deletes a customer. The API returns 409 when they still have orders; pass
 * force once the user has confirmed those orders should go too.
 */
export function deleteCustomer(id, { force = false } = {}) {
  return api
    .delete(`/customers/${id}`, { params: force ? { force: true } : undefined })
    .then((r) => r.data.data);
}

