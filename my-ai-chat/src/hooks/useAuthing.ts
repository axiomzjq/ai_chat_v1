import { useState, useEffect, useCallback } from 'react';
import { AUTHING_CONFIG, isAuthingConfigured } from '../lib/authing';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role: 'user' | 'admin';
}

function loadLocalUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('my_ai_chat_user');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveLocalUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem('my_ai_chat_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('my_ai_chat_user');
  }
}

/**
 * Authing 认证 Hook
 * 在 Authing 未配置前，使用本地 mock 登录（开发调试用）
 */
export function useAuthing() {
  const [user, setUser] = useState<AuthUser | null>(() => loadLocalUser());
  const [loading, setLoading] = useState(false);
  const configured = isAuthingConfigured();

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      if (!configured) {
        // 降级：本地 mock 登录（开发调试）
        const mockUser: AuthUser = {
          id: 'local-' + Date.now(),
          email,
          name: email.split('@')[0],
          role: email.includes('admin') ? 'admin' : 'user',
        };
        setUser(mockUser);
        saveLocalUser(mockUser);
        return mockUser;
      }
      throw new Error('Authing 尚未完成接入，请先配置 VITE_AUTHING_APP_ID 和 VITE_AUTHING_DOMAIN');
    } finally {
      setLoading(false);
    }
  }, [configured]);

  const logout = useCallback(async () => {
    setUser(null);
    saveLocalUser(null);
  }, []);

  const isAdmin = user?.role === 'admin';

  return { user, loading, configured, login, logout, isAdmin };
}
