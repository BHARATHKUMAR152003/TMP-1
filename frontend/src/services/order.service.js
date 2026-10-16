import api, { unwrapWithMeta } from './api.js';

export function listOrders(params = {}) {
  return unwrapWithMeta(api.get('/orders', { params }));
}

export function getOrder(id) {
  return api.get(`/orders/${id}`).then((r) => r.data.data);
}

/** Creates an order. `payload` may be a plain object or FormData (with files). */
export function createOrder(payload) {
  const isForm = payload instanceof FormData;
  return api
    .post('/orders', payload, isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined)
    .then((r) => r.data.data);
}

export function updateOrder(id, payload) {
  return api.put(`/orders/${id}`, payload).then((r) => r.data.data);
}

export function updateOrderStatus(id, status, note) {
  return api.patch(`/orders/${id}/status`, { status, note }).then((r) => r.data.data);
}

export function addOrderComment(id, comment) {
  return api.post(`/orders/${id}/comments`, { comment }).then((r) => r.data.data);
}

/** Admin only — removes the order along with its invoice and payments. */
export function deleteOrder(id) {
  return api.delete(`/orders/${id}`).then((r) => r.data.data);
}

