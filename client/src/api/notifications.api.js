import api from '../lib/axios.js';

export const notificationsApi = {
  async list(params = {}) {
    const { data } = await api.get('/notifications', { params });
    return data.data; // { items, page, limit, total, unread }
  },
  async unreadCount() {
    const { data } = await api.get('/notifications/unread-count');
    return data.data.unread; // number
  },
  async markRead(id) {
    const { data } = await api.patch(`/notifications/${id}/read`);
    return data.data.notification;
  },
  async markAllRead() {
    const { data } = await api.patch('/notifications/read-all');
    return data.data;
  },
};
