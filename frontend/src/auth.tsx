import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { config } from './config';
import { apiFetch } from './api';

interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<string>;
  register: (username: string, email: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // При монтировании — пробуем достать сессию из cookies.
  useEffect(() => {
    apiFetch('/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.user) setUser(data.user); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function authRequest(url: string, body: Record<string, string>): Promise<string> {
    const res = await apiFetch(url.replace(config.apiPrefix, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    if (data.user) setUser(data.user);
    return data.user?.username ?? '';
  }

  const authCtx: AuthState = {
    user,
    loading,
    login: (username, password) =>
      authRequest('/auth/login', { username, password }),
    register: (username, email, password) =>
      authRequest('/auth/register', { username, email, password }),
    logout: async () => {
      await apiFetch('/auth/logout', { method: 'POST' });
      setUser(null);
    },
    refresh: async () => {
      try {
        const res = await apiFetch('/auth/refresh', { method: 'POST' });
        if (!res.ok) { setUser(null); return; }
        const data = await res.json();
        if (data.user) setUser(data.user);
      } catch {
        setUser(null);
      }
    },
  };

  return <AuthContext.Provider value={authCtx}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
