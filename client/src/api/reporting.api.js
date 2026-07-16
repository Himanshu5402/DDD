import api from '../lib/axios.js';

export const REPORT_MOODS = ['great', 'good', 'okay', 'stressed', 'blocked'];
export const REPORT_MOOD_LABELS = {
  great: 'Great',
  good: 'Good',
  okay: 'Okay',
  stressed: 'Stressed',
  blocked: 'Blocked',
};
export const REPORT_MOOD_COLOR = {
  great: 'success',
  good: 'primary',
  okay: 'default',
  stressed: 'warning',
  blocked: 'error',
};

export const REPORT_STATUSES = ['submitted', 'reviewed'];
export const REPORT_STATUS_LABELS = { submitted: 'Submitted', reviewed: 'Reviewed' };
export const REPORT_STATUS_COLOR = { submitted: 'warning', reviewed: 'success' };

export const reportingApi = {
  async submit(payload) {
    const { data } = await api.post('/reports/submit', payload);
    return data.data.report;
  },
  async mine(params = {}) {
    const { data } = await api.get('/reports/mine', { params });
    return data; // { data: [reports], meta: { page, limit, total, totalPages } }
  },
  async team(params = {}) {
    const { data } = await api.get('/reports/team', { params });
    return data.data; // { date, reports }
  },
  async get(id) {
    const { data } = await api.get(`/reports/${id}`);
    return data.data.report;
  },
  async review(id) {
    const { data } = await api.patch(`/reports/${id}/review`);
    return data.data.report;
  },
  async aiSummary(id) {
    const { data } = await api.post(`/reports/${id}/ai-summary`);
    return data.data; // { summary, provider }
  },
  async digest(body = {}) {
    const { data } = await api.post('/reports/digest', body);
    return data.data; // { digest, provider, reportCount }
  },
};
