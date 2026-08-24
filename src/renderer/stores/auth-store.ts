import { create } from 'zustand';

interface AuthState {
  username: string;
  password: string;
  token: string;
  hardwareIdentitySeed: string | null;
  proxyListUrl: string | null;
  isAuthenticated: boolean;

  setCredentials: (username: string, password: string) => void;
  setToken: (token: string) => void;
  setHardwareIdentitySeed: (seed: string | null) => void;
  setProxyListUrl: (url: string | null) => void;
  setAuthenticated: (value: boolean) => void;
  clearSecrets: () => void;
  reset: () => void;
}

const initialState = {
  username: '',
  password: '',
  token: '',
  hardwareIdentitySeed: null,
  proxyListUrl: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,

  setCredentials: (username, password) => set({ username, password }),
  setToken: (token) => set({ token }),
  setHardwareIdentitySeed: (hardwareIdentitySeed) => set({ hardwareIdentitySeed }),
  setProxyListUrl: (proxyListUrl) => set({ proxyListUrl }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  clearSecrets: () => set({ username: '', password: '', token: '' }),
  reset: () => set(initialState),
}));
