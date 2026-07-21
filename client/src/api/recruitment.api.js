import api from '../lib/axios.js';

// --- Enum option lists (mirror the server models) ---------------------------

export const POSITION_STATUSES = ['open', 'on_hold', 'closed', 'filled'];
export const POSITION_STATUS_LABELS = {
  open: 'Open',
  on_hold: 'On Hold',
  closed: 'Closed',
  filled: 'Filled',
};

export const POSITION_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const POSITION_PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const CANDIDATE_STAGES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
  'dropped',
];
export const CANDIDATE_STAGE_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  dropped: 'Dropped',
};

export const positionsApi = {
  // Returns the full envelope { data: items, meta } so callers can read totals.
  async list(params = {}) {
    const { data } = await api.get('/recruitment/positions', {
      params: {
        ...(params.page ? { page: params.page } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
        ...(params.sort ? { sort: params.sort } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.department ? { department: params.department } : {}),
        ...(params.company ? { company: params.company } : {}),
      },
    });
    return data;
  },
  async create(payload) {
    const { data } = await api.post('/recruitment/positions', payload);
    return data.data.position;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/recruitment/positions/${id}`, payload);
    return data.data.position;
  },
  async remove(id) {
    await api.delete(`/recruitment/positions/${id}`);
  },
};

export const candidatesApi = {
  // Returns the full envelope { data: items, meta } so callers can read totals.
  async list(params = {}) {
    const { data } = await api.get('/recruitment/candidates', {
      params: {
        ...(params.page ? { page: params.page } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
        ...(params.sort ? { sort: params.sort } : {}),
        ...(params.position ? { position: params.position } : {}),
        ...(params.stage ? { stage: params.stage } : {}),
      },
    });
    return data;
  },
  async create(payload) {
    const { data } = await api.post('/recruitment/candidates', payload);
    return data.data.candidate;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/recruitment/candidates/${id}`, payload);
    return data.data.candidate;
  },
  async moveStage(id, stage) {
    const { data } = await api.patch(`/recruitment/candidates/${id}/stage`, { stage });
    return data.data.candidate;
  },
  async remove(id) {
    await api.delete(`/recruitment/candidates/${id}`);
  },
};

export const recruitmentApi = {
  async summary() {
    const { data } = await api.get('/recruitment/summary');
    return data.data;
  },
};
