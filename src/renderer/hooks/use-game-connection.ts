import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ServerChannel } from '@shared/constants/server-channels';
import { useConnectionStore } from '../stores/connection-store';
import { useAuthStore } from '../stores/auth-store';
import { useGameStore } from '../stores/game-store';
import { useUIStore } from '../stores/ui-store';
import { gameApi } from '../lib/game-api';
import { markSuppressReconnect } from '../lib/reconnect-controller';

/**
 * Orchestrates the login flow: select channel -> connect -> login -> charlist.
 */
export const useGameConnection = () => {
  const {
    setStatus,
    selectChannel,
    setError,
    reset: resetConnection,
  } = useConnectionStore(
    useShallow((s) => ({
      setStatus: s.setStatus,
      selectChannel: s.selectChannel,
      setError: s.setError,
      reset: s.reset,
    })),
  );
  const {
    setCredentials,
    setToken,
    setHardwareIdentitySeed,
    setProxyListUrl,
    reset: resetAuth,
  } = useAuthStore(
    useShallow((s) => ({
      setCredentials: s.setCredentials,
      setToken: s.setToken,
      setHardwareIdentitySeed: s.setHardwareIdentitySeed,
      setProxyListUrl: s.setProxyListUrl,
      reset: s.reset,
    })),
  );
  const { setScreen, setLoading, showGameMessage } = useUIStore(
    useShallow((s) => ({
      setScreen: s.setScreen,
      setLoading: s.setLoading,
      showGameMessage: s.showGameMessage,
    })),
  );

  const connect = useCallback(
    (
      channel: ServerChannel,
      username: string,
      password: string,
      token: string,
      hardwareIdentitySeed: string | null,
      proxyListUrl: string | null,
    ) => {
      selectChannel(channel);
      setCredentials(username, password);
      setToken(token);
      setHardwareIdentitySeed(hardwareIdentitySeed);
      setProxyListUrl(proxyListUrl);
      setStatus('connecting');
      setLoading(true);

      gameApi.connect(channel, proxyListUrl);
    },
    [
      selectChannel,
      setCredentials,
      setToken,
      setHardwareIdentitySeed,
      setProxyListUrl,
      setStatus,
      setLoading,
    ],
  );

  const disconnect = useCallback(() => {
    markSuppressReconnect();
    gameApi.disconnect();
    resetConnection();
    resetAuth();
    useGameStore.getState().clearEntities();
    setScreen('login');
  }, [resetConnection, resetAuth, setScreen]);

  const onError = useCallback(
    (message: string) => {
      setError(message);
      setLoading(false);
      showGameMessage(message);
    },
    [setError, setLoading, showGameMessage],
  );

  return { connect, disconnect, onError };
};
