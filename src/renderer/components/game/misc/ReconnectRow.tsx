import { type FC, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useConnectionStore } from '../../../stores/connection-store';
import { useCharlistStore } from '../../../stores/charlist-store';
import { useAuthStore } from '../../../stores/auth-store';
import {
  selectActiveReconnectBag,
  useReconnectStore,
  type ReconnectPhase,
} from '../../../stores/reconnect-store';
import { isBagArmed } from '../../../lib/reconnect-helpers';
import { cancelReconnect } from '../../../lib/reconnect-controller';
import { getWydAPI } from '../../../lib/electron-api';
import { MiscCard } from './MiscCard';
import { ReconnectCredentialsForm } from './ReconnectCredentialsForm';

interface ReconnectRowProps {
  disabled: boolean;
}

export const ReconnectRow: FC<ReconnectRowProps> = ({ disabled }) => {
  const { enabled, bagKey, phase, setBagKey, setEnabled, upsertActiveBag, setPhase, disarm } =
    useReconnectStore(
      useShallow((s) => ({
        enabled: s.enabled,
        bagKey: s.bagKey,
        phase: s.phase,
        setBagKey: s.setBagKey,
        setEnabled: s.setEnabled,
        upsertActiveBag: s.upsertActiveBag,
        setPhase: s.setPhase,
        disarm: s.disarm,
      })),
    );

  const bag = useReconnectStore(selectActiveReconnectBag);
  const liveChannel = useConnectionStore((s) => s.selectedChannel);
  const selectedCharIndex = useCharlistStore((s) => s.selectedIndex);
  const hardwareIdentitySeed = useAuthStore((s) => s.hardwareIdentitySeed);
  const proxyListUrl = useAuthStore((s) => s.proxyListUrl);

  const [loadError, setLoadError] = useState<string | null>(null);

  const username = bag?.username ?? '';
  const password = bag?.password ?? '';
  const token = bag?.token ?? '';

  useEffect(() => {
    if (bagKey) return;
    const load = async (): Promise<void> => {
      try {
        const api = getWydAPI();
        if (!api) {
          setLoadError('API do Electron indisponível.');
          return;
        }
        const key = await api.getMachineBindingKey();
        setBagKey(key);
        setLoadError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(message || 'Falha ao obter chave do dispositivo.');
      }
    };
    void load();
  }, [bagKey, setBagKey]);

  // Canal e slot vêm da sessão viva — grava no bag enquanto habilitado.
  useEffect(() => {
    if (!enabled || !bagKey) return;
    if (liveChannel) upsertActiveBag({ channel: liveChannel });
  }, [enabled, bagKey, liveChannel, upsertActiveBag]);

  useEffect(() => {
    if (!enabled || !bagKey) return;
    if (selectedCharIndex >= 0) upsertActiveBag({ charIndex: selectedCharIndex });
  }, [enabled, bagKey, selectedCharIndex, upsertActiveBag]);

  useEffect(() => {
    if (!enabled) return;
    if (phase === 'reconnecting' || phase === 'waiting-backoff') return;
    const next: ReconnectPhase = isBagArmed(bag) ? 'armed' : 'incomplete';
    if (phase !== next) setPhase(next);
  }, [enabled, bag, phase, setPhase]);

  const handleToggle = (next: boolean): void => {
    if (next) {
      if (!bagKey) {
        setLoadError('Aguardando chave do dispositivo…');
        return;
      }
      if (!liveChannel) {
        setLoadError('Sem canal da sessão — entre no jogo antes de armar o Reconnect.');
        return;
      }
      setEnabled(true);
      useReconnectStore.getState().setSuppressReconnect(false);
      upsertActiveBag({
        channel: liveChannel,
        charIndex: selectedCharIndex >= 0 ? selectedCharIndex : 0,
        hardwareIdentitySeed,
        proxyListUrl,
      });
      setPhase('incomplete');
      setLoadError(null);
    } else {
      cancelReconnect('toggle off');
      disarm();
    }
  };

  return (
    <MiscCard
      title="Reconnect"
      description="Reloga automaticamente se o servidor derrubar a conexão. Canal e personagem usam a sessão atual. As configurações daqui não são salvas na config."
      enabled={enabled}
      onToggle={handleToggle}
      disabled={disabled || !bagKey}
      kind="session"
    >
      <ReconnectCredentialsForm
        username={username}
        password={password}
        token={token}
        disabled={disabled}
        onUsernameChange={(v) => upsertActiveBag({ username: v })}
        onPasswordChange={(v) => upsertActiveBag({ password: v })}
        onTokenChange={(v) => upsertActiveBag({ token: v })}
      />

      {loadError && (
        <p className="mt-2.5 text-[11px] text-red-400" role="alert">
          {loadError}
        </p>
      )}
    </MiscCard>
  );
};
