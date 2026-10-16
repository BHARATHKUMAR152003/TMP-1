import api from './api.js';

export function listEmployees(params = {}) {
  return api.get('/employees', { params }).then((r) => r.data.data);
}

export function createEmployee(payload) {
  return api.post('/employees', payload).then((r) => r.data.data);
}

export function updateEmployee(id, payload) {
  return api.put(`/employees/${id}`, payload).then((r) => r.data.data);
}

export function toggleActive(id, isActive) {
  return api.patch(`/employees/${id}/active`, { isActive }).then((r) => r.data.data);
}
