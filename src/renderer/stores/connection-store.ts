import { create } from 'zustand';
import type { ServerChannel } from '@shared/constants/server-channels';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  selectedChannel: ServerChannel | null;
  errorMessage: string | null;
  detailMessage: string | null;

  setStatus: (status: ConnectionStatus) => void;
  selectChannel: (channel: ServerChannel) => void;
  setError: (message: string) => void;
  setDetail: (message: string | null) => void;
  reset: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  selectedChannel: null,
  errorMessage: null,
  detailMessage: null,

  setStatus: (status) =>
    set((state) =>
      status === 'error'
        ? { status }
        : {
            status,
            errorMessage: null,
            detailMessage: status === 'connecting' ? state.detailMessage : null,
          },
    ),
  selectChannel: (channel) => set({ selectedChannel: channel }),
  setError: (message) => set({ status: 'error', errorMessage: message, detailMessage: null }),
  setDetail: (detailMessage) => set({ detailMessage }),
  reset: () =>
    set({
      status: 'disconnected',
      selectedChannel: null,
      errorMessage: null,
      detailMessage: null,
    }),
}));
