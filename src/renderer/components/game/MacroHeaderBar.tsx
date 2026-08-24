import { type FC } from 'react';
import { ExclamationTriangleIcon, StopIcon } from '@heroicons/react/20/solid';
import { MacroStatus } from '../../stores/macro-status';
import { useCurrentMacroAction, type MacroAction } from '../../hooks/use-current-macro-action';
import { AccentCard } from '../shared/AccentCard';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import { TransportButton, type TransportMode } from './TransportButton';

interface MacroHeaderBarProps {
  status: MacroStatus;
  statusMessage: string | null;
  selectedStepIndex: number | null;
  currentStepIndex: number;
  onPrimary: () => void;
  onStop: () => void;
  primaryDisabled: boolean;
}

interface HeaderState {
  barColor: string;
  dotClass: string;
  textClass: string;
  statusText: string;
  errorDetail: string | null;
  primaryMode: TransportMode;
  primaryLabel: string;
}

const formatMacroAction = (action: MacroAction): string => {
  switch (action.kind) {
    case 'walking':
      return 'Andando';
    case 'engaging':
      return action.targetName ? `Indo atacar ${action.targetName.trim()}` : 'Indo atacar';
    case 'attacking':
      return action.targetName ? `Atacando ${action.targetName.trim()}` : 'Atacando';
    case 'returning':
      return 'Voltando';
    case 'givingUp':
      return `Desistindo de ${action.targetName.trim()}`;
  }
  action satisfies never;
  throw new Error('unreachable');
};

const getHeaderState = (
  status: MacroStatus,
  statusMessage: string | null,
  selectedStepIndex: number | null,
  currentStepIndex: number,
): HeaderState => {
  if (status === MacroStatus.Running) {
    return {
      barColor: 'var(--color-good)',
      dotClass: 'bg-good animate-soft-pulse motion-reduce:animate-none',
      textClass: 'text-cyan-300',
      statusText: 'Executando',
      errorDetail: null,
      primaryMode: 'pause',
      primaryLabel: 'Pause',
    };
  }
  if (status === MacroStatus.Paused && statusMessage) {
    return {
      barColor: 'var(--color-bad)',
      dotClass: 'bg-bad animate-soft-pulse motion-reduce:animate-none',
      textClass: 'text-red-300',
      statusText: `Pausado por erro · passo ${currentStepIndex + 1}`,
      errorDetail: statusMessage,
      primaryMode: 'resume',
      primaryLabel: 'Retomar',
    };
  }
  if (status === MacroStatus.Paused) {
    return {
      barColor: 'var(--color-yellow-400)',
      dotClass: 'bg-yellow-400',
      textClass: 'text-yellow-300',
      statusText: `Pausado · passo ${currentStepIndex + 1}`,
      errorDetail: null,
      primaryMode: 'resume',
      primaryLabel: 'Retomar',
    };
  }
  if (selectedStepIndex != null) {
    return {
      barColor: 'var(--color-gray-600)',
      dotClass: 'bg-gray-400',
      textClass: 'text-gray-300',
      statusText: `Iniciar do passo ${selectedStepIndex + 1}`,
      errorDetail: null,
      primaryMode: 'play',
      primaryLabel: 'Play',
    };
  }
  return {
    barColor: 'var(--color-gray-600)',
    dotClass: 'bg-gray-500',
    textClass: 'text-gray-300',
    statusText: 'Pronto',
    errorDetail: null,
    primaryMode: 'play',
    primaryLabel: 'Play',
  };
};

export const MacroHeaderBar: FC<MacroHeaderBarProps> = ({
  status,
  statusMessage,
  selectedStepIndex,
  currentStepIndex,
  onPrimary,
  onStop,
  primaryDisabled,
}) => {
  const { barColor, dotClass, textClass, statusText, errorDetail, primaryMode, primaryLabel } =
    getHeaderState(status, statusMessage, selectedStepIndex, currentStepIndex);

  const action = useCurrentMacroAction();
  const actionLabel = status === MacroStatus.Running && action ? formatMacroAction(action) : null;

  return (
    <AccentCard variant="bar" accent={barColor}>
      <div className="flex items-center gap-2 pl-2.5">
        {errorDetail ? (
          <Tooltip content={errorDetail} placement="bottom-start" variant="error">
            <span className="inline-flex shrink-0">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
            </span>
          </Tooltip>
        ) : (
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        )}
        <span className={`shrink-0 text-[11px] ${textClass}`}>{statusText}</span>
        {actionLabel && <span className="shrink-0 text-[11px] text-gray-400">· {actionLabel}</span>}
        {errorDetail && (
          <span
            className="max-w-[260px] truncate font-mono text-[11px] text-red-300"
            title={errorDetail}
          >
            · {errorDetail}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <TransportButton mode={primaryMode} onClick={onPrimary} disabled={primaryDisabled}>
          {primaryLabel}
        </TransportButton>
        <Button
          variant="ghost-muted"
          size="icon-sm"
          onClick={onStop}
          disabled={status === MacroStatus.Idle}
          aria-label="Parar"
        >
          <StopIcon className="h-4 w-4" />
        </Button>
      </div>
    </AccentCard>
  );
};
