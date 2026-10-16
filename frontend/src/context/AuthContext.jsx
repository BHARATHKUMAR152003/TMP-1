import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as authService from '../services/auth.service.js';
import { getToken } from '../services/api.js';

const USER_KEY = 'printpress_user';
const AuthContext = createContext(null);

/**
 * Holds the authenticated user. Persists to localStorage so a refresh keeps the
 * session, and revalidates the token against /auth/me on mount. There is no
 * public sign-up: accounts are created by an admin.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [initializing, setInitializing] = useState(true);

  const persist = useCallback((nextUser) => {
    setUser(nextUser);
    if (nextUser) localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(USER_KEY);
  }, []);

  // Revalidate the stored token on first load.
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!getToken()) {
        setInitializing(false);
        return;
      }
      try {
        const profile = await authService.fetchProfile();
        if (active) persist({ ...profile });
      } catch {
        if (active) persist(null);
      } finally {
        if (active) setInitializing(false);
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, [persist]);

  const login = useCallback(
    async (email, password) => {
      const loggedIn = await authService.login(email, password);
      persist(loggedIn);
      return loggedIn;
    },
    [persist],
  );

  const logout = useCallback(() => {
    authService.logout();
    persist(null);
  }, [persist]);

  const updateProfile = useCallback(
    async (payload) => {
      const updated = await authService.updateProfile(payload);
      persist({ ...user, ...updated });
      return updated;
    },
    [persist, user],
  );

  const value = useMemo(
    () => ({ user, initializing, isAuthenticated: Boolean(user), login, logout, updateProfile, setUser: persist }),
    [user, initializing, login, logout, updateProfile, persist],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
