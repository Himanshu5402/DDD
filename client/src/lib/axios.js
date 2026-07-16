import axios from 'axios';
import { API_URL } from '../config/env.js';
import { tokenStore } from './tokenStore.js';

// Fired when the session can't be recovered (refresh failed) so the app can
// redirect to /login. AuthContext listens for this.
export const SESSION_EXPIRED_EVENT = 'itsybizzz:session-expired';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send/receive the refresh cookie when same-site
  headers: { 'Content-Type': 'application/json' },
});

// Attach the access token to every request.
api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Single-flight refresh: coalesce concurrent 401s into one refresh call ---
let refreshing = null;

async function performRefresh() {
  const refreshToken = tokenStore.getRefresh();
  const res = await axios.post(
    `${API_URL}/auth/refresh`,
    { refreshToken },
    { withCredentials: true }
  );
  const { accessToken, refreshToken: newRefresh } = res.data.data;
  tokenStore.set({ accessToken, refreshToken: newRefresh });
  return accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    const original = config || {};

    // Don't try to refresh for the auth endpoints themselves, or after a retry.
    const isAuthCall = original.url?.includes('/auth/login') || original.url?.includes('/auth/refresh');

    if (response?.status === 401 && !original._retry && !isAuthCall && tokenStore.getRefresh()) {
      original._retry = true;
      try {
        refreshing = refreshing || performRefresh().finally(() => (refreshing = null));
        const newToken = await refreshing;
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        tokenStore.clear();
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

/** Normalize an axios error into a friendly message. */
export function getErrorMessage(error, fallback = 'Something went wrong') {
  return error?.response?.data?.message || error?.message || fallback;
}

export default api;
