import { useReconnectStore } from '../stores/reconnect-store';
import { isBagArmed } from './reconnect-helpers';
import {
  isReconnectOwned,
  isReconnectSuppressingDisconnect,
  reconnectSkipReason,
} from './reconnect-controller';
import { gameApi } from './game-api';

export interface WydDevConsole {
  dropConnection: () => void;
  reconnectStatus: () => Record<string, unknown>;
}

declare global {
  interface Window {
    __wydDev?: WydDevConsole;
  }
}

export const installDevReconnectConsole = (): void => {
  if (!import.meta.env.DEV) return;

  const api: WydDevConsole = {
    dropConnection: () => {
      const skip = reconnectSkipReason();
      if (skip) {
        console.warn(`[__wydDev] dropConnection: reconnect NÃO vai armar — ${skip}`);

        console.warn('[__wydDev] confira __wydDev.reconnectStatus()');
      } else {
        console.info('[__wydDev] dropConnection: reconnect armado — aguardando dialog…');
      }
      gameApi.disconnect();
    },
    reconnectStatus: () => {
      const s = useReconnectStore.getState();
      const bag = s.getActiveBag();
      return {
        enabled: s.enabled,
        bagKey: s.bagKey ? `${s.bagKey.slice(0, 8)}…` : null,
        phase: s.phase,
        attempt: s.attempt,
        maxAttempts: s.maxAttempts,
        suppressReconnect: s.suppressReconnect,
        macroShouldRestart: s.macroShouldRestart,
        owned: isReconnectOwned(),
        suppressingCleanupDisconnect: isReconnectSuppressingDisconnect(),
        armed: s.enabled && isBagArmed(bag),
        skipReason: reconnectSkipReason(),
        lastError: s.lastError,
        bag: bag
          ? {
              channel: bag.channel?.name ?? null,
              username: bag.username,
              hasPassword: bag.password.length > 0,
              tokenLen: bag.token.length,
              charIndex: bag.charIndex,
            }
          : null,
      };
    },
  };

  window.__wydDev = api;

  console.info(
    '[__wydDev] reconnect helpers ready → __wydDev.dropConnection() | __wydDev.reconnectStatus()',
  );
};
