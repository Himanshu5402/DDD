import api from '../lib/axios.js';

export const PRODUCT_CATEGORIES = [
  'process_automation',
  'mern',
  'sap',
  'abap',
  'blockchain',
  'ai',
  'robotics',
  'cameras',
  'conveyors',
  'iot',
  'scada',
  'plc',
  'sensors',
  'custom_hardware',
  'other',
];

export const PRODUCT_CATEGORY_LABELS = {
  process_automation: 'Process Automation',
  mern: 'MERN',
  sap: 'SAP',
  abap: 'ABAP',
  blockchain: 'Blockchain',
  ai: 'AI',
  robotics: 'Robotics',
  cameras: 'Cameras',
  conveyors: 'Conveyors',
  iot: 'IoT',
  scada: 'SCADA',
  plc: 'PLC',
  sensors: 'Sensors',
  custom_hardware: 'Custom Hardware',
  other: 'Other',
};

export const PRODUCT_STATUSES = ['development', 'active', 'deprecated'];
export const PRODUCT_STATUS_LABELS = {
  development: 'Development',
  active: 'Active',
  deprecated: 'Deprecated',
};

export const ROADMAP_STATUSES = ['planned', 'in_progress', 'released'];
export const ROADMAP_STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In Progress',
  released: 'Released',
};

export const productsApi = {
  async list(params = {}) {
    const { data } = await api.get('/products', { params });
    return data; // { data: items, meta: { page, limit, total, ... } }
  },
  async get(id) {
    const { data } = await api.get(`/products/${id}`);
    return data.data.product;
  },
  async create(payload) {
    const { data } = await api.post('/products', payload);
    return data.data.product;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/products/${id}`, payload);
    return data.data.product;
  },
  async remove(id) {
    await api.delete(`/products/${id}`);
  },
  async addVersion(id, body) {
    const { data } = await api.post(`/products/${id}/versions`, body);
    return data.data.product;
  },
  async addRoadmapItem(id, body) {
    const { data } = await api.post(`/products/${id}/roadmap`, body);
    return data.data.product;
  },
  async updateRoadmapItem(id, itemId, body) {
    const { data } = await api.patch(`/products/${id}/roadmap/${itemId}`, body);
    return data.data.product;
  },
};
