// In-app token storage. Access + refresh tokens are persisted to localStorage
// so sessions survive reloads. (For higher-security deployments, move the
// refresh token to an httpOnly cookie — the API already sets one.)
const ACCESS_KEY = 'itsybizzz.accessToken';
const REFRESH_KEY = 'itsybizzz.refreshToken';

const listeners = new Set();

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),

  set({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    listeners.forEach((l) => l());
  },

  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    listeners.forEach((l) => l());
  },

  hasSession: () => Boolean(localStorage.getItem(ACCESS_KEY)),

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
