import api from '../lib/axios.js';

export const rolesApi = {
  async list() {
    const { data } = await api.get('/roles', { params: { limit: 100 } });
    return data; // { data: roles[], meta }
  },
  async catalog() {
    const { data } = await api.get('/roles/permissions/catalog');
    return data.data.permissions; // { module: [{ _id, key, action, description }] }
  },
  async create(payload) {
    const { data } = await api.post('/roles', payload);
    return data.data.role;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/roles/${id}`, payload);
    return data.data.role;
  },
  async setPermissions(id, permissions) {
    const { data } = await api.put(`/roles/${id}/permissions`, { permissions });
    return data.data.role;
  },
  async remove(id) {
    await api.delete(`/roles/${id}`);
  },
};
