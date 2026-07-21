import api from '../lib/axios.js';

export const PAYROLL_STATUSES = ['draft', 'processing', 'processed', 'paid'];
export const PAYROLL_STATUS_LABELS = {
  draft: 'Draft',
  processing: 'Processing',
  processed: 'Processed',
  paid: 'Paid',
};

export const payrollApi = {
  async list(params = {}) {
    const { data } = await api.get('/payroll/periods', { params });
    return data; // { data: items, meta: { page, limit, total, ... } }
  },
  async summary() {
    const { data } = await api.get('/payroll/summary');
    return data.data; // { latest, trend }
  },
  async create(payload) {
    const { data } = await api.post('/payroll/periods', payload);
    return data.data.period;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/payroll/periods/${id}`, payload);
    return data.data.period;
  },
  async remove(id) {
    await api.delete(`/payroll/periods/${id}`);
  },
};
