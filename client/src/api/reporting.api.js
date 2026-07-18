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

export const REPORT_STATUSES = [
  'submitted',
  'manager_approved',
  'manager_rejected',
  'admin_approved',
  'admin_rejected',
];
export const REPORT_STATUS_LABELS = {
  submitted: 'Pending manager',
  manager_approved: 'Pending admin',
  manager_rejected: 'Returned by manager',
  admin_approved: 'Accepted',
  admin_rejected: 'Returned by admin',
};
export const REPORT_STATUS_COLOR = {
  submitted: 'warning',
  manager_approved: 'info',
  manager_rejected: 'error',
  admin_approved: 'success',
  admin_rejected: 'error',
};

// Employee-facing labels (My Report / My History). Simpler than the reviewer
// pipeline: once your manager approves, YOU see "Approved" — the admin layer is
// a management concern, not something the employee tracks.
export const EMPLOYEE_STATUS_LABELS = {
  submitted: 'Pending review',
  manager_approved: 'Accepted',
  manager_rejected: 'Needs changes',
  admin_approved: 'Accepted',
  admin_rejected: 'In review', // bounced admin→manager; you'll hear back if changes are needed
};
export const EMPLOYEE_STATUS_COLOR = {
  submitted: 'warning',
  manager_approved: 'success',
  manager_rejected: 'error',
  admin_approved: 'success',
  admin_rejected: 'info',
};

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
    return data.data; // { date, reports, scope: 'admin' | 'manager' }
  },
  async get(id) {
    const { data } = await api.get(`/reports/${id}`);
    return data.data.report;
  },
  async approve(id) {
    const { data } = await api.patch(`/reports/${id}/approve`);
    return data.data.report;
  },
  async reject(id, reason) {
    const { data } = await api.patch(`/reports/${id}/reject`, { reason });
    return data.data.report;
  },
  async upload(files) {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    const { data } = await api.post('/reports/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data.attachments; // [{ url, key, type, name, size, mimeType }]
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
