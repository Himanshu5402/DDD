import api from '../lib/axios.js';

export const customFieldsApi = {
  async list(entityType, includeInactive = true) {
    const { data } = await api.get('/custom-fields', { params: { entityType, includeInactive } });
    return data.data.definitions;
  },
  async create(payload) {
    const { data } = await api.post('/custom-fields', payload);
    return data.data.definition;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/custom-fields/${id}`, payload);
    return data.data.definition;
  },
  async remove(id) {
    await api.delete(`/custom-fields/${id}`);
  },
};
