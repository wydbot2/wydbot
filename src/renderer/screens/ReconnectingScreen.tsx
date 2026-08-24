import { type FC, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GateShell } from '../components/login/GateShell';
import { GateStatusFooter } from '../components/login/GateStatusFooter';
import { Spinner } from '../components/shared/Spinner';
import { useReconnectStore } from '../stores/reconnect-store';
import { useConnectionStore } from '../stores/connection-store';

const formatCountdown = (ms: number): string => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return sec === 1 ? '1 segundo' : `${sec} segundos`;
};

export const ReconnectingScreen: FC = () => {
  const { attempt, maxAttempts, phase, nextRetryAt, lastError } = useReconnectStore(
    useShallow((s) => ({
      attempt: s.attempt,
      maxAttempts: s.maxAttempts,
      phase: s.phase,
      nextRetryAt: s.nextRetryAt,
      lastError: s.lastError,
    })),
  );

  const [now, setNow] = useState(() => Date.now());
  const connectionDetail = useConnectionStore((state) => state.detailMessage);

  useEffect(() => {
    if (nextRetryAt == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [nextRetryAt]);

  const remainingMs = nextRetryAt != null ? nextRetryAt - now : 0;
  const isWaiting = nextRetryAt != null && remainingMs > 0;

  const attemptLabel =
    attempt > 0 ? `Tentativa ${attempt} de ${maxAttempts}` : 'Preparando reconexão…';

  const phaseLabel = isWaiting
    ? `Próxima tentativa em ${formatCountdown(remainingMs)}`
    : phase === 'reconnecting' || phase === 'waiting-backoff'
      ? (connectionDetail ?? 'Conectando ao servidor…')
      : 'Aguardando…';

  return (
    <GateShell centered footer={<GateStatusFooter state="reconectando" tone="accent" />}>
      <Spinner size={36} className="border-accent-500/30 border-t-accent-400" />
      <h1 className="text-base font-semibold text-gray-100">Reconectando…</h1>
      <p className="max-w-[240px] text-xs leading-relaxed text-gray-400">
        A conexão com o servidor caiu. Estamos tentando entrar de novo automaticamente.
      </p>
      <div className="flex w-full flex-col items-center gap-1" role="status" aria-live="polite">
        <p className="text-sm font-medium text-gray-200">{attemptLabel}</p>
        <p className="text-[11px] text-gray-500">{phaseLabel}</p>
        {lastError && attempt > 1 && (
          <p className="mt-1 max-w-[240px] text-center text-[11px] text-amber-400/90">
            Última falha: {lastError}
          </p>
        )}
      </div>
    </GateShell>
  );
};
