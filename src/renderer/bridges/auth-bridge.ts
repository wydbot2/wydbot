import type { WydBotAPI } from '@shared/ipc/ipc-api';
import { useAuthStore } from '../stores/auth-store';
import { useCharlistStore } from '../stores/charlist-store';
import { useConnectionStore } from '../stores/connection-store';
import { useReconnectStore } from '../stores/reconnect-store';
import { useUIStore } from '../stores/ui-store';
import { gameApi } from '../lib/game-api';
import {
  isReconnectOwned,
  isReconnectSuppressingDisconnect,
  onLoginFailedDuringReconnect,
  onReconnectConnectionError,
  onReconnectProxyConnected,
  onReconnectSocketConnected,
  onTokenAcceptedDuringReconnect,
  onUnexpectedDisconnect,
  shouldHandleDisconnect,
} from '../lib/reconnect-controller';
import { isBagArmed, RECONNECT_FAIL } from '../lib/reconnect-helpers';
import { logger } from '../lib/logger';
import { getServerMessage, isServerPopupSubtype, resolveServerMessage } from '../lib/strdef-lookup';

export const setupAuthBridge = (api: WydBotAPI): (() => void)[] => {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    api.onProxyConnectionStatus((proxyStatus) => {
      const connection = useConnectionStore.getState();

      switch (proxyStatus.phase) {
        case 'downloading':
          connection.setDetail('Baixando lista de proxies…');
          break;
        case 'testing':
          connection.setDetail(`Testando proxy ${proxyStatus.current}/${proxyStatus.total}…`);
          break;
        case 'connected':
          connection.setDetail(`Proxy aprovado · ${proxyStatus.latencyMs} ms`);
          logger.log(`[PROXY] ${proxyStatus.proxy} aprovado em ${proxyStatus.latencyMs} ms`);
          onReconnectProxyConnected();
          break;
        case 'failed':
          logger.warn(`[PROXY] ${proxyStatus.message}`);
          useUIStore.getState().setLoading(false);
          if (isReconnectOwned()) {
            onLoginFailedDuringReconnect(proxyStatus.message);
          } else {
            connection.setError(proxyStatus.message);
          }
          break;
      }
    }),
  );

  unsubs.push(
    api.onConnectionStatus((status) => {
      logger.log(`[BRIDGE] Connection status: ${status}`);

      if (status === 'connected') {
        useConnectionStore.getState().setStatus('connected');

        if (isReconnectOwned()) {
          onReconnectSocketConnected();
          const bag = useReconnectStore.getState().getActiveBag();
          if (!bag || !isBagArmed(bag)) {
            logger.warn('[BRIDGE] reconnect connected but bag incomplete');
            onLoginFailedDuringReconnect(RECONNECT_FAIL.CREDENTIALS);
            return;
          }
          logger.log('[BRIDGE] Reconnect: sending login from bag…');
          gameApi.login(bag.username, bag.password, bag.hardwareIdentitySeed);
          return;
        }

        const { username, password, hardwareIdentitySeed } = useAuthStore.getState();
        if (username && password) {
          logger.log('[BRIDGE] Sending login packet...');
          gameApi.login(username, password, hardwareIdentitySeed);
        }
      } else if (status === 'disconnected') {
        const connection = useConnectionStore.getState();

        // The server normally sends 0x105 and immediately closes the socket on
        // authentication rejection. Keep that translated error and the pending
        // credentials available for a corrected retry instead of turning the
        // close event into a fresh, empty login screen.
        if (connection.errorMessage) {
          logger.log('[BRIDGE] disconnected after login error → preserving retry state');
          useUIStore.getState().setLoading(false);
          useUIStore.getState().setScreen('login');
          return;
        }

        if (shouldHandleDisconnect() || isReconnectOwned()) {
          logger.log('[BRIDGE] disconnected → reconnect controller');
          if (!isReconnectOwned()) {
            useAuthStore.getState().reset();
          }
          connection.setStatus('disconnected');
          useUIStore.getState().setLoading(false);
          onUnexpectedDisconnect();
          return;
        }

        if (useReconnectStore.getState().phase === 'failed') {
          logger.log('[BRIDGE] disconnected → phase=failed (stay on reconnect-failed)');
          useConnectionStore.getState().setStatus('disconnected');
          useUIStore.getState().setLoading(false);
          return;
        }

        logger.log('[BRIDGE] disconnected → login (reconnect not armed)');
        useConnectionStore.getState().reset();
        useAuthStore.getState().reset();
        useUIStore.getState().setLoading(false);
        useUIStore.getState().setScreen('login');
      } else if (status === 'error') {
        if (isReconnectOwned()) {
          if (onReconnectConnectionError()) return;
          if (isReconnectSuppressingDisconnect()) return;
          onLoginFailedDuringReconnect(RECONNECT_FAIL.CONNECTION_ERROR);
          return;
        }
        const connection = useConnectionStore.getState();
        if (!connection.errorMessage) connection.setError('Connection error');
        useUIStore.getState().setLoading(false);
      }
    }),
  );

  unsubs.push(
    api.onLoginSuccess((data) => {
      logger.log('[BRIDGE] Login successful');
      useAuthStore.getState().setAuthenticated(true);
      useCharlistStore.getState().setSelChar(data.selChar);

      if (isReconnectOwned()) {
        const bag = useReconnectStore.getState().getActiveBag();
        const token = bag?.token ?? '';
        logger.log(`[BRIDGE] Reconnect: auto-sending token (length=${token.length})`);
        gameApi.submitToken(token);
        return;
      }

      const { token } = useAuthStore.getState();
      logger.log(`[BRIDGE] Auto-sending token (length=${token.length})`);
      gameApi.submitToken(token);
    }),
  );

  unsubs.push(
    api.onServerMessage((data) => {
      if (!isServerPopupSubtype(data.subtype)) return;

      const screen = useUIStore.getState().currentScreen;

      if (
        screen === 'login' ||
        screen === 'charlist' ||
        screen === 'reconnecting' ||
        isReconnectOwned()
      ) {
        const resolution = resolveServerMessage(data.code);
        const message = resolution.found
          ? resolution.text
          : `Falha no login (código ${data.code}).`;
        logger.warn(
          `[SERVER] Login error: ${message} (code=${data.code}, subtype=${data.subtype})`,
        );
        if (isReconnectOwned()) {
          onLoginFailedDuringReconnect(message);
          return;
        }
        useConnectionStore.getState().setError(message);
        useUIStore.getState().setLoading(false);
        return;
      }

      logger.warn(
        `[SERVER] In-game message: ${getServerMessage(data.code)} (code=${data.code}, subtype=${data.subtype})`,
      );
    }),
  );

  unsubs.push(
    api.onTokenResponse((success) => {
      if (success) {
        useAuthStore.getState().clearSecrets();
        if (isReconnectOwned()) {
          useUIStore.getState().setLoading(false);
          onTokenAcceptedDuringReconnect();
          return;
        }
        logger.log('[BRIDGE] Token accepted, showing char list');
        useUIStore.getState().setScreen('charlist');
        useUIStore.getState().setLoading(false);
      } else {
        logger.warn('[SERVER] Token incorrect');
        useUIStore.getState().setLoading(false);
        if (isReconnectOwned()) {
          onLoginFailedDuringReconnect(RECONNECT_FAIL.TOKEN_REJECT);
        } else {
          useConnectionStore.getState().setError(RECONNECT_FAIL.TOKEN_REJECT);
        }
      }
    }),
  );

  return unsubs;
};
