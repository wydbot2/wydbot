import type { WydBotAPI } from '@shared/ipc/ipc-api';
import { useUIStore } from '../stores/ui-store';
import { logger } from '../lib/logger';

export const setupErrorBridge = (api: WydBotAPI): (() => void)[] => {
  const unsubs: (() => void)[] = [];

  // --- Errors ---
  unsubs.push(
    api.onAppError((error) => {
      logger.warn(`[BRIDGE] App error: [${error.code}] ${error.message}`, error.details);
      useUIStore.getState().showGameMessage(error.message);
    }),
  );

  return unsubs;
};
