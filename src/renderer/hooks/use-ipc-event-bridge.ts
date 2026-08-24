import { useEffect } from 'react';
import { getWydAPI } from '../lib/electron-api';
import { setupAuthBridge } from '../bridges/auth-bridge';
import { setupCharlistBridge } from '../bridges/charlist-bridge';
import { setupWorldBridge } from '../bridges/world-bridge';
import { setupPartyBridge } from '../bridges/party-bridge';
import { setupErrorBridge } from '../bridges/error-bridge';
import { setupLogBridge } from '../bridges/log-bridge';
import { setupAmbientModulesBridge } from '../bridges/ambient-modules-bridge';

/**
 * Wires all IPC events from the main process to Zustand stores.
 * Mount once at the App level.
 *
 * Flow: TCP connected -> auto-send login -> handle response -> navigate.
 */
export const useIpcEventBridge = (): void => {
  useEffect(() => {
    const api = getWydAPI();
    if (!api) return;

    const unsubs = [
      ...setupAuthBridge(api),
      ...setupCharlistBridge(api),
      ...setupWorldBridge(api),
      ...setupPartyBridge(api),
      ...setupErrorBridge(api),
      ...setupLogBridge(api),
      ...setupAmbientModulesBridge(),
    ];

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);
};
