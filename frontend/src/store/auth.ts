import { create } from 'zustand';
import { api } from '../lib/api';

export interface User {
  id: number;
  username: string;
}

export type AuthPhase = 'loading' | 'needs-setup' | 'anon' | 'authed';

interface AuthState {
  phase: AuthPhase;
  user: User | null;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  setup: (token: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  phase: 'loading',
  user: null,

  async bootstrap() {
    try {
      const s = await api.get<{ needsSetup: boolean }>('/api/setup/status');
      if (s.needsSetup) {
        set({ phase: 'needs-setup', user: null });
        return;
      }
    } catch {
      /* fall through to session check */
    }
    try {
      const me = await api.get<{ user: User }>('/api/auth/me');
      set({ phase: 'authed', user: me.user });
    } catch {
      set({ phase: 'anon', user: null });
    }
  },

  async login(username, password) {
    const res = await api.post<{ user: User }>('/api/auth/login', { username, password });
    set({ phase: 'authed', user: res.user });
  },

  async setup(token, username, password) {
    const res = await api.post<{ user: User }>('/api/setup', { token, username, password });
    set({ phase: 'authed', user: res.user });
  },

  async logout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* clear local state regardless */
    }
    set({ phase: 'anon', user: null });
  },
}));
