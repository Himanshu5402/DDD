import api from '../lib/axios.js';

export const authApi = {
  async login(credentials) {
    const { data } = await api.post('/auth/login', credentials);
    return data.data; // { user, accessToken, refreshToken }
  },

  async register(payload) {
    const { data } = await api.post('/auth/register', payload);
    return data.data;
  },

  async me() {
    const { data } = await api.get('/auth/me');
    return data.data; // { user, permissions, isSuperAdmin }
  },

  async logout(refreshToken) {
    await api.post('/auth/logout', { refreshToken });
  },
};
