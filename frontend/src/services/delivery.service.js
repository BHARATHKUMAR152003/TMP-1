import api from './api.js';

export function getQueue() {
  return api.get('/delivery/queue').then((r) => r.data.data);
}

export function getHistory(params = {}) {
  return api.get('/delivery/history', { params }).then((r) => r.data.data);
}

export function markOutForDelivery(id) {
  return api.post(`/delivery/${id}/out-for-delivery`).then((r) => r.data.data);
}

export function markDelivered(id, note) {
  return api.post(`/delivery/${id}/delivered`, { note }).then((r) => r.data.data);
}

export function generateSlip(id, notes) {
  return api.post(`/delivery/${id}/slip`, { notes }).then((r) => r.data.data);
}
