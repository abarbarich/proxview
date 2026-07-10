import { create } from 'zustand';
import { api } from '../lib/api';

export interface UserPublic {
  id: number;
  username: string;
  createdAt: number;
}

interface UsersState {
  users: UserPublic[];
  loaded: boolean;
  load: () => Promise<void>;
  invite: (username: string, password: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

export const useUsers = create<UsersState>((set, get) => ({
  users: [],
  loaded: false,

  async load() {
    const d = await api.get<{ users: UserPublic[] }>('/api/users');
    set({ users: d.users, loaded: true });
  },

  async invite(username, password) {
    const r = await api.post<{ user: UserPublic }>('/api/users', { username, password });
    set({ users: [...get().users, r.user] });
  },

  async remove(id) {
    await api.del(`/api/users/${id}`);
    set({ users: get().users.filter((u) => u.id !== id) });
  },

  changePassword(current, next) {
    return api
      .post('/api/account/password', { currentPassword: current, newPassword: next })
      .then(() => undefined);
  },
}));
