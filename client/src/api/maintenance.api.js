import api from '../lib/axios.js';

// --- Enum option lists (mirror the server models) ---------------------------
export const ASSET_STATUSES = ['operational', 'under_maintenance', 'breakdown', 'retired'];
export const MAINTENANCE_TYPES = ['preventive', 'breakdown', 'inspection', 'calibration', 'amc_service'];
export const MAINTENANCE_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];

export const assetsApi = {
  // Returns the full envelope { data: items, meta } so callers can read totals.
  async list(params = {}) {
    const { data } = await api.get('/maintenance/assets', { params });
    return data;
  },
  async get(id) {
    const { data } = await api.get(`/maintenance/assets/${id}`);
    return data.data; // { asset, records }
  },
  async create(payload) {
    const { data } = await api.post('/maintenance/assets', payload);
    return data.data.asset;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/maintenance/assets/${id}`, payload);
    return data.data.asset;
  },
  async remove(id) {
    await api.delete(`/maintenance/assets/${id}`);
  },
};

export const recordsApi = {
  // Returns the full envelope { data: items, meta } so callers can read totals.
  async list(params = {}) {
    const { data } = await api.get('/maintenance/records', { params });
    return data;
  },
  async create(payload) {
    const { data } = await api.post('/maintenance/records', payload);
    return data.data.record;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/maintenance/records/${id}`, payload);
    return data.data.record;
  },
  async remove(id) {
    await api.delete(`/maintenance/records/${id}`);
  },
};

export const maintenanceApi = {
  assets: assetsApi,
  records: recordsApi,
  async upcoming(days = 30) {
    const { data } = await api.get('/maintenance/upcoming', { params: { days } });
    return data.data; // { days, records, expiringWarranties, expiringAmc }
  },
};
