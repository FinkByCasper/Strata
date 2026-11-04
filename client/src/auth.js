import { create } from 'zustand';
import { api } from './api';

export const useAuth = create((set) => ({
  ready: false,
  authEnabled: false,
  signupOpen: false,
  user: null,
  refresh: async () => {
    const s = await api.me();
    set({ ready: true, authEnabled: s.authEnabled, signupOpen: s.signupOpen, user: s.user });
  },
  signIn: async (email, password) => set({ user: await api.login(email, password) }),
  signUp: async (email, password, displayName) => set({ user: await api.register(email, password, displayName) }),
  signOut: async () => {
    await api.logout().catch(() => {});
    window.location.assign('/');
  },
  lost: () => set({ user: null }),
}));
