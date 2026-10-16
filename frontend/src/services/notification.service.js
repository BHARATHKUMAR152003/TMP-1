import api from './api.js';

export function listNotifications(params = {}) {
  return api.get('/notifications', { params }).then((r) => r.data.data);
}

export function markRead(id) {
  return api.patch(`/notifications/${id}/read`);
}

export function markAllRead() {
  return api.patch('/notifications/read-all');
}
