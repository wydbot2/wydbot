import { type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GateShell } from '../components/login/GateShell';
import { GateStatusFooter } from '../components/login/GateStatusFooter';
import { WarnIcon } from '../components/login/gate-icons';
import { Button } from '../components/shared/Button';
import { CTA_CLASS, CTA_SHADOW } from '../components/login/auth-cta';
import { useReconnectStore } from '../stores/reconnect-store';
import { useUIStore } from '../stores/ui-store';
import { cancelReconnect } from '../lib/reconnect-controller';

export const ReconnectFailedScreen: FC = () => {
  const { lastError, setPhase, setAttempt, setLastError } = useReconnectStore(
    useShallow((s) => ({
      lastError: s.lastError,
      setPhase: s.setPhase,
      setAttempt: s.setAttempt,
      setLastError: s.setLastError,
    })),
  );
  const setScreen = useUIStore((s) => s.setScreen);

  const goToLogin = (): void => {
    cancelReconnect('user dismissed failure');
    setPhase('incomplete');
    setAttempt(0);
    setLastError(null);
    setScreen('login');
  };

  return (
    <GateShell centered footer={<GateStatusFooter state="falha na reconexão" tone="error" />}>
      <WarnIcon width={40} height={40} className="text-red-400" />
      <h1 className="text-base font-semibold text-gray-100">Não foi possível reconectar</h1>
      <p className="max-w-[240px] text-xs leading-relaxed text-gray-400">
        {lastError ??
          'Esgotamos as tentativas de reconexão automática. Entre de novo com suas credenciais.'}
      </p>
      <Button
        type="button"
        fullWidth
        className={`mt-1 ${CTA_CLASS}`}
        style={CTA_SHADOW}
        onClick={goToLogin}
      >
        Ir para o login
      </Button>
    </GateShell>
  );
};
