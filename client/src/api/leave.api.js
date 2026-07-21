import api from '../lib/axios.js';

export const LEAVE_TYPES = [
  'casual',
  'sick',
  'earned',
  'unpaid',
  'comp_off',
  'maternity',
  'paternity',
];

export const LEAVE_TYPE_LABELS = {
  casual: 'Casual',
  sick: 'Sick',
  earned: 'Earned',
  unpaid: 'Unpaid',
  comp_off: 'Comp Off',
  maternity: 'Maternity',
  paternity: 'Paternity',
};

export const LEAVE_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
export const LEAVE_REQUEST_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const leaveApi = {
  async listRequests(params = {}) {
    const query = {};
    if (params.status) query.status = params.status;
    if (params.leaveType) query.leaveType = params.leaveType;
    if (params.user) query.user = params.user;
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;
    if (params.page) query.page = params.page;
    if (params.limit) query.limit = params.limit;
    const { data } = await api.get('/leave/requests', { params: query });
    return data; // { data: items, meta: { page, limit, total, ... } }
  },
  async createRequest(payload) {
    const { data } = await api.post('/leave/requests', payload);
    return data.data.request;
  },
  async updateRequest(id, payload) {
    const { data } = await api.patch(`/leave/requests/${id}`, payload);
    return data.data.request;
  },
  async decideRequest(id, decision) {
    const { data } = await api.post(`/leave/requests/${id}/decide`, { decision });
    return data.data.request;
  },
  async removeRequest(id) {
    await api.delete(`/leave/requests/${id}`);
  },
  async listBalances(params = {}) {
    const query = {};
    if (params.user) query.user = params.user;
    if (params.year) query.year = params.year;
    if (params.page) query.page = params.page;
    if (params.limit) query.limit = params.limit;
    const { data } = await api.get('/leave/balances', { params: query });
    return data;
  },
  async summary(params = {}) {
    const query = {};
    if (params.year) query.year = params.year;
    const { data } = await api.get('/leave/summary', { params: query });
    return data.data;
  },
};
