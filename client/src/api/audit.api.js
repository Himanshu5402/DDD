import api from '../lib/axios.js';

export const auditApi = {
  async list(params) {
    const { data } = await api.get('/audit', { params });
    return data; // { data: entries[], meta }
  },
};
