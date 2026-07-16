import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authApi } from '../api/auth.api.js';
import { tokenStore } from '../lib/tokenStore.js';
import { SESSION_EXPIRED_EVENT } from '../lib/axios.js';
import { connectSocket, disconnectSocket } from '../lib/socket.js';

const AuthContext = createContext(null);

// status: 'loading' | 'authenticated' | 'unauthenticated'
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState(new Set());
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [status, setStatus] = useState('loading');

  const applyProfile = useCallback((profile) => {
    setUser(profile.user);
    setPermissions(new Set(profile.permissions || []));
    setIsSuperAdmin(Boolean(profile.isSuperAdmin));
    setStatus('authenticated');
    connectSocket();
  }, []);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    disconnectSocket();
    setUser(null);
    setPermissions(new Set());
    setIsSuperAdmin(false);
    setStatus('unauthenticated');
  }, []);

  // Bootstrap: restore session on load.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!tokenStore.hasSession()) {
        setStatus('unauthenticated');
        return;
      }
      try {
        const profile = await authApi.me();
        if (active) applyProfile(profile);
      } catch {
        if (active) clearSession();
      }
    })();
    return () => {
      active = false;
    };
  }, [applyProfile, clearSession]);

  // React to global session-expiry (refresh failed).
  useEffect(() => {
    const handler = () => clearSession();
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, [clearSession]);

  const login = useCallback(
    async (credentials) => {
      const { accessToken, refreshToken } = await authApi.login(credentials);
      tokenStore.set({ accessToken, refreshToken });
      const profile = await authApi.me(); // fetch roles + permissions
      applyProfile(profile);
      return profile;
    },
    [applyProfile]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout(tokenStore.getRefresh());
    } catch {
      /* ignore network errors on logout */
    }
    clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (module, action) => {
      if (isSuperAdmin) return true;
      return permissions.has(`${module}:${action}`) || permissions.has(`${module}:manage`);
    },
    [isSuperAdmin, permissions]
  );

  const value = useMemo(
    () => ({
      user,
      permissions,
      isSuperAdmin,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
      hasPermission,
    }),
    [user, permissions, isSuperAdmin, status, login, logout, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
