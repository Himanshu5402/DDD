import api from '../lib/axios.js';

export const usersApi = {
  /** The signed-in user's direct reports (their team). Authenticate-only. */
  async myTeam() {
    const { data } = await api.get('/users/my-team');
    return data.data.team; // [{ _id, name, email, avatar, designation, department, company }]
  },
  /** Directory of all active users with reportsTo links (for the org chart). */
  async orgChart() {
    const { data } = await api.get('/users/org-chart');
    return data.data.users;
  },
};
