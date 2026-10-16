import api, { setToken } from './api.js';

export async function login(email, password) {
  const res = await api.post('/auth/login', { email, password });
  const { token, user } = res.data.data;
  setToken(token);
  return user;
}

export async function fetchProfile() {
  const res = await api.get('/auth/me');
  return res.data.data;
}

export async function changePassword(currentPassword, newPassword) {
  await api.patch('/auth/change-password', { currentPassword, newPassword });
}

/** Update the signed-in user's own profile (name and phone). */
export async function updateProfile(payload) {
  const res = await api.patch('/auth/me', payload);
  return res.data.data;
}

export function logout() {
  setToken(null);
  localStorage.removeItem('printpress_user');
}
