import api from '../lib/axios.js';

export const GOAL_TYPES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
  'two_year',
  'five_year',
  'lifetime',
  'custom',
];

export const GOAL_TYPE_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-Yearly',
  yearly: 'Yearly',
  two_year: '2-Year',
  five_year: '5-Year',
  lifetime: 'Lifetime',
  custom: 'Custom',
};

export const GOAL_STATUSES = ['not_started', 'in_progress', 'on_track', 'at_risk', 'achieved', 'abandoned'];

export const GOAL_STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  on_track: 'On Track',
  at_risk: 'At Risk',
  achieved: 'Achieved',
  abandoned: 'Abandoned',
};

// MUI Chip colors keyed by status.
export const GOAL_STATUS_COLOR = {
  not_started: 'default',
  in_progress: 'info',
  on_track: 'primary',
  at_risk: 'warning',
  achieved: 'success',
  abandoned: 'error',
};

export const goalsApi = {
  async list(params = {}) {
    const { data } = await api.get('/goals', { params });
    return data; // { data: items, meta }
  },
  async get(id) {
    const { data } = await api.get(`/goals/${id}`);
    return data.data; // { goal, children }
  },
  async create(payload) {
    const { data } = await api.post('/goals', payload);
    return data.data.goal;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/goals/${id}`, payload);
    return data.data.goal;
  },
  async updateProgress(id, body) {
    const { data } = await api.patch(`/goals/${id}/progress`, body); // { progress?, currentValue? }
    return data.data.goal;
  },
  async remove(id) {
    await api.delete(`/goals/${id}`);
  },
  async addMilestone(id, payload) {
    const { data } = await api.post(`/goals/${id}/milestones`, payload); // { title, dueDate? }
    return data.data.milestones;
  },
  async toggleMilestone(id, itemId) {
    const { data } = await api.patch(`/goals/${id}/milestones/${itemId}`);
    return data.data.milestones;
  },
  async addChecklistItem(id, text) {
    const { data } = await api.post(`/goals/${id}/checklist`, { text });
    return data.data.checklist;
  },
  async toggleChecklistItem(id, itemId) {
    const { data } = await api.patch(`/goals/${id}/checklist/${itemId}`);
    return data.data.checklist;
  },
  async aiSuggestions(id) {
    const { data } = await api.post(`/goals/${id}/ai-suggestions`);
    return data.data; // { suggestions, provider, model }
  },
  /** Tasks linked to a goal (read-only view in the goal drawer). */
  async linkedTasks(goalId) {
    const { data } = await api.get('/tasks', { params: { goal: goalId, includeSubtasks: true, limit: 100 } });
    return data.data; // array of tasks
  },
};
