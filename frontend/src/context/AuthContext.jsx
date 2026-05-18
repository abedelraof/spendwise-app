import { createContext, useState, useEffect, useCallback } from 'react';

export const AuthContext = createContext(null);

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', dark);
    root.classList.remove('high-contrast');
  } else if (theme === 'high-contrast') {
    root.classList.add('dark', 'high-contrast');
  } else {
    root.classList.toggle('dark', theme === 'dark');
    root.classList.remove('high-contrast');
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  useEffect(() => {
    const theme = user?.theme || localStorage.getItem('theme') || 'light';
    applyTheme(theme);

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [user]);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.setItem('theme', newUser.theme || 'light');
    applyTheme(newUser.theme || 'light');
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((updates) => {
    const updated = { ...user, ...updates };
    localStorage.setItem('user', JSON.stringify(updated));
    if (updates.theme) {
      localStorage.setItem('theme', updates.theme);
      applyTheme(updates.theme);
    }
    setUser(updated);
  }, [user]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
