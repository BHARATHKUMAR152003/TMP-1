import api from './api.js';

export function listCategories(params = {}) {
  return api.get('/categories', { params }).then((r) => r.data.data);
}

export function createCategory(payload) {
  return api.post('/categories', payload).then((r) => r.data.data);
}

export function updateCategory(id, payload) {
  return api.put(`/categories/${id}`, payload).then((r) => r.data.data);
}

export function deleteCategory(id) {
  return api.delete(`/categories/${id}`).then((r) => r.data.data);
}
