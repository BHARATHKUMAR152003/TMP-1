import axios from 'axios';

const TOKEN_KEY = 'printpress_token';

/**
 * Central axios instance. Base URL comes from VITE_API_URL and defaults to the
 * Vite dev proxy (/api/v1 -> localhost:5000). A request interceptor attaches
 * the JWT; a response interceptor unwraps the { success, message, data } envelope
 * and force-logs-out on 401.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 20000,
});

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      // Session expired / invalid — clear and bounce to login (but not while
      // already on the login request itself to avoid a redirect loop).
      const isAuthCall = error.config?.url?.includes('/auth/login');
      if (!isAuthCall) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('printpress_user');
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }
    // Normalize the error message for callers. Field-level validation errors are
    // folded into the message so the user sees what actually failed.
    const data = error.response?.data;
    const details = Array.isArray(data?.details) ? data.details : [];
    const fieldText = details
      .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
      .filter(Boolean)
      .join(' · ');
    const base = data?.message || error.message || 'Something went wrong. Please try again.';
    const message = fieldText ? `${base} — ${fieldText}` : base;
    return Promise.reject(Object.assign(error, { displayMessage: message }));
  },
);

/** Unwraps the standard envelope so callers get `data` directly. */
export function unwrap(promise) {
  return promise.then((res) => res.data?.data);
}

/** Like unwrap but also returns pagination/summary meta. */
export function unwrapWithMeta(promise) {
  return promise.then((res) => ({ data: res.data?.data, meta: res.data?.meta }));
}

export default api;
