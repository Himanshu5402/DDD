import api from '../lib/axios.js';

/**
 * Friendly message for write-through/forward failures. A 502 from the DDD
 * server means the HRMS itself could not be reached — surface that clearly.
 */
export function hrmsErrorMessage(error, fallback = 'Something went wrong') {
  if (error?.response?.status === 502) return 'HRMS unreachable — try again';
  return error?.response?.data?.message || error?.message || fallback;
}

/** Same convention for the PEPSI execution portal (502 = portal itself down). */
export function pepsiErrorMessage(error, fallback = 'Something went wrong') {
  if (error?.response?.status === 502) return 'PEPSI unreachable — try again';
  return error?.response?.data?.message || error?.message || fallback;
}

export const integrationsApi = {
  async hrmsStatus() {
    const { data } = await api.get('/integrations/hrms/status');
    return data.data; // { enabled, hrmsReachable, lastSyncAt, counts }
  },
  async hrmsSync() {
    const { data } = await api.post('/integrations/hrms/sync');
    return data; // { data: { status, lastSyncAt, ...counts }, message }
  },
  async pepsiStatus() {
    const { data } = await api.get('/integrations/pepsi/status');
    return data.data; // { projects, lastSyncedAt, ... }
  },
  // Server-initiated pull: live PEPSI API first, bundled snapshot fallback.
  async pepsiPull() {
    const { data } = await api.post('/integrations/pepsi/pull');
    return data; // { data: { source, ...counts }, message }
  },
};
