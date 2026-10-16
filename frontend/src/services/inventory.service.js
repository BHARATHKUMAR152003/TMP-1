import api from './api.js';

export function listInventory(params = {}) {
  return api.get('/inventory', { params }).then((r) => r.data.data);
}

export function createItem(payload) {
  return api.post('/inventory', payload).then((r) => r.data.data);
}

export function updateItem(id, payload) {
  return api.put(`/inventory/${id}`, payload).then((r) => r.data.data);
}

export function deleteItem(id) {
  return api.delete(`/inventory/${id}`).then((r) => r.data.data);
}

/** Operator records consumption of an item; the backend decrements the stock. */
export function consumeItem(id, payload) {
  return api.post(`/inventory/${id}/consume`, payload).then((r) => r.data.data);
}

/** Adds (positive delta) or removes (negative delta) stock in one step. */
export function adjustItem(id, delta, note) {
  return api.post(`/inventory/${id}/adjust`, { delta, note }).then((r) => r.data.data);
}

export function listUsage() {
  return api.get('/inventory/usage').then((r) => r.data.data);
}

// ── Taxonomy: groups → categories → types ────────────────────────────
export function getTaxonomy() {
  return api.get('/inventory/taxonomy').then((r) => r.data.data);
}

export function createGroup(name) {
  return api.post('/inventory/groups', { name }).then((r) => r.data.data);
}

export function renameGroup(id, name) {
  return api.put(`/inventory/groups/${id}`, { name }).then((r) => r.data.data);
}

export function deleteGroup(id) {
  return api.delete(`/inventory/groups/${id}`).then((r) => r.data.data);
}

export function createCategory(groupId, name) {
  return api.post('/inventory/categories', { groupId, name }).then((r) => r.data.data);
}

export function renameCategory(id, name) {
  return api.put(`/inventory/categories/${id}`, { name }).then((r) => r.data.data);
}

export function deleteCategory(id) {
  return api.delete(`/inventory/categories/${id}`).then((r) => r.data.data);
}

export function createType(categoryId, name) {
  return api.post('/inventory/types', { categoryId, name }).then((r) => r.data.data);
}

export function renameType(id, name) {
  return api.put(`/inventory/types/${id}`, { name }).then((r) => r.data.data);
}

export function deleteType(id) {
  return api.delete(`/inventory/types/${id}`).then((r) => r.data.data);
}
