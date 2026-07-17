import api from '../lib/axios.js';

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked', 'done'];
export const TASK_STATUS_LABELS = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  blocked: 'Blocked',
  done: 'Done',
};
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export const tasksApi = {
  async board(params = {}) {
    const { data } = await api.get('/tasks/board', { params });
    return data.data; // { columns: [{ status, tasks }] }
  },
  async get(id) {
    const { data } = await api.get(`/tasks/${id}`);
    return data.data; // { task, subtasks }
  },
  async create(payload) {
    const { data } = await api.post('/tasks', payload);
    return data.data.task;
  },
  async update(id, payload) {
    const { data } = await api.patch(`/tasks/${id}`, payload);
    return data.data.task;
  },
  async move(id, body) {
    const { data } = await api.patch(`/tasks/${id}/move`, body);
    return data.data;
  },
  async delegate(id, { assignees, note }) {
    const { data } = await api.post(`/tasks/${id}/delegate`, { assignees, note });
    return data.data.task;
  },
  async remove(id) {
    await api.delete(`/tasks/${id}`);
  },
  async addComment(id, body) {
    const { data } = await api.post(`/tasks/${id}/comments`, { body });
    return data.data.comment;
  },
  async addChecklistItem(id, text) {
    const { data } = await api.post(`/tasks/${id}/checklist`, { text });
    return data.data.checklist;
  },
  async toggleChecklistItem(id, itemId) {
    const { data } = await api.patch(`/tasks/${id}/checklist/${itemId}`);
    return data.data.checklist;
  },
  async logTime(id, minutes, note) {
    const { data } = await api.post(`/tasks/${id}/time`, { minutes, note });
    return data.data;
  },
  async aiSummary(id) {
    const { data } = await api.post(`/tasks/${id}/ai-summary`);
    return data.data; // { summary, provider, model }
  },
};
