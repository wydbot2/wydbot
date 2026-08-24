import type { WydBotAPI } from '@shared/ipc/ipc-api';
import { useCharlistStore } from '../stores/charlist-store';
import { useUIStore } from '../stores/ui-store';
import { logger } from '../lib/logger';

export const setupCharlistBridge = (api: WydBotAPI): (() => void)[] => {
  const unsubs: (() => void)[] = [];

  // --- Character list ---
  unsubs.push(
    api.onCharList((data) => {
      logger.log('[BRIDGE] Character list received');
      useCharlistStore.getState().setSelChar(data);
      useUIStore.getState().setScreen('charlist');
      useUIStore.getState().setLoading(false);
    }),
  );

  return unsubs;
};
