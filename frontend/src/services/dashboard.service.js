import api from './api.js';

/** Fetches the dashboard payload for a given role. `range` is 'today' or 'all'. */
export function getDashboard(role, range = 'today') {
  return api.get(`/dashboard/${role}`, { params: { range } }).then((r) => r.data.data);
}
