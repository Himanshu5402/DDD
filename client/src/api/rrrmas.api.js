import api from '../lib/axios.js';

// --- Enum option lists (mirror the server models) ---------------------------
export const CONTACT_TYPES = ['lead', 'customer'];
export const CONTACT_STATUSES = ['new', 'contacted', 'qualified', 'active', 'inactive', 'lost'];
export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
export const RENEWAL_STATUSES = ['upcoming', 'due', 'renewed', 'expired', 'cancelled'];
export const CAMPAIGN_CHANNELS = ['email', 'social', 'ads', 'event', 'other'];
export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed'];
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const TICKET_STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];

/** Build a standard CRUD client for an RRRMAS resource at /rrrmas/<resource>. */
function createClient(resource, key) {
  return {
    // Returns the full envelope { data: items, meta } so callers can read totals.
    async list(params = {}) {
      const { data } = await api.get(`/rrrmas/${resource}`, { params });
      return data;
    },
    async get(id) {
      const { data } = await api.get(`/rrrmas/${resource}/${id}`);
      return data.data[key];
    },
    async create(payload) {
      const { data } = await api.post(`/rrrmas/${resource}`, payload);
      return data.data[key];
    },
    async update(id, payload) {
      const { data } = await api.patch(`/rrrmas/${resource}/${id}`, payload);
      return data.data[key];
    },
    async remove(id) {
      await api.delete(`/rrrmas/${resource}/${id}`);
    },
  };
}

export const contactsApi = createClient('contacts', 'contact');
export const projectsApi = createClient('projects', 'project');
export const renewalsApi = createClient('renewals', 'renewal');
export const campaignsApi = createClient('campaigns', 'campaign');
export const ticketsApi = createClient('tickets', 'ticket');

export const rrrmasApi = {
  contacts: contactsApi,
  projects: projectsApi,
  renewals: renewalsApi,
  campaigns: campaignsApi,
  tickets: ticketsApi,
};
