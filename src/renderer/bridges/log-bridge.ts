import type { WydBotAPI } from '@shared/ipc/ipc-api';
import { useLogStore } from '../stores/log-store';

export const setupLogBridge = (api: WydBotAPI): (() => void)[] => {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    api.onLogBatch((entries) => {
      useLogStore.getState().addBatch(entries);
    }),
  );

  return unsubs;
};
