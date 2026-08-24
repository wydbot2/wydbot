/**
 * Type-safe access to the WYD IPC API exposed via preload script.
 * The preload script exposes `window.wydAPI` via contextBridge.
 */

import type { WydBotAPI } from '@shared/ipc/ipc-api';

export const getWydAPI = (): WydBotAPI | undefined => {
  return (window as { wydAPI?: WydBotAPI }).wydAPI;
};
