import { type FC, useEffect, useRef, useState } from 'react';
import { CommandLineIcon, PlayIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { normalizeMarkerName } from '@shared/app-config';
import { useMacroLifecycleStore } from '../../stores/macro-lifecycle-store';
import { usePlayerStore } from '../../stores/player-store';
import { useAppConfigStore } from '../../stores/app-config-store';
import { MacroStatus } from '../../stores/macro-status';
import { useUIStore } from '../../stores/ui-store';
import { buildCtxHandle } from '../../lib/script-ctx';
import { runScript, translateScriptError } from '../../lib/script-runtime';
import { validateStepDraft } from '../../lib/macro-step-validators';
import type { StepDraft } from '../../stores/macro-types';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { TextInput } from '../shared/TextInput';
import { ScriptEditor } from '../shared/ScriptEditor';
import { DocsSplitButton } from './DocsSplitButton';

/** Same budget as the macro engine. Pure JS only — host `await` is suspended via asyncify. */
const TEST_TIMEOUT_MS = 5000;

/** Cap to prevent unbounded growth in tight loops. */
const MAX_TEST_LOGS = 500;

type RunState = 'idle' | 'success' | 'error';

interface RunLog {
  ts: number;
  level: 'info' | 'error' | 'pause';
  message: string;
}

const LEVEL_COLORS: Record<RunLog['level'], string> = {
  info: 'text-blue-400',
  error: 'text-red-400',
  pause: 'text-orange-400',
};

const STATE_PILL: Record<RunState, { label: string; className: string }> = {
  idle: { label: 'Aguardando', className: 'bg-gray-700 text-gray-300' },
  success: { label: 'Sucesso', className: 'bg-green-600 text-white' },
  error: { label: 'Erro', className: 'bg-red-600 text-white' },
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
};

/** Local source state until Save — committing every keystroke would re-render every store subscriber. */
export const ScriptEditModal: FC = () => {
  const isOpen = useUIStore((s) => s.activeModal === 'script-edit');
  const stepId = useUIStore((s) => s.editingStepId);
  const closeStepEdit = useUIStore((s) => s.closeStepEdit);

  const step = useAppConfigStore(
    useShallow((s) => (stepId ? s.config.steps?.find((x) => x.id === stepId) : undefined)),
  );
  const stepIndex = useAppConfigStore((s) =>
    stepId ? (s.config.steps?.findIndex((x) => x.id === stepId) ?? -1) : -1,
  );
  const updateScriptStep = useAppConfigStore((s) => s.updateScriptStep);
  const macroIsRunning = useMacroLifecycleStore((s) => s.status === MacroStatus.Running);
  const playerPos = usePlayerStore(useShallow((s) => s.position));

  const [name, setName] = useState('');
  const [source, setSource] = useState('');

  const [runState, setRunState] = useState<RunState>('idle');
  const [isRunning, setIsRunning] = useState(false);
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const resetRunState = (): void => {
    setRunState('idle');
    setIsRunning(false);
    setRunLogs([]);
    setRunError(null);
  };

  useEffect(() => {
    if (isOpen && step && step.kind === 'script') {
      setName(step.name);
      setSource(step.source);
      resetRunState();
    }
  }, [isOpen, step]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ block: 'end' });
  }, [runLogs.length]);

  // Abort the QuickJS context on close — otherwise it leaks until the timeout fires.
  useEffect(() => {
    if (!isOpen && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [isOpen]);

  const handleRun = async (): Promise<void> => {
    if (isRunning || macroIsRunning) return;

    const ac = new AbortController();
    abortRef.current = ac;

    setIsRunning(true);
    setRunLogs([]);
    setRunError(null);

    const appendLog = (level: RunLog['level'], message: string): void => {
      setRunLogs((prev) => {
        const next = [...prev, { ts: Date.now(), level, message }];
        return next.length > MAX_TEST_LOGS ? next.slice(-MAX_TEST_LOGS) : next;
      });
    };

    try {
      await runScript(
        source,
        (qctx) =>
          buildCtxHandle(qctx, {
            log: appendLog,
            onPauseRequest: (reason) => appendLog('pause', reason ?? '(sem motivo)'),
            onAttackPauseRequest: () => appendLog('pause', 'ataque pausado'),
            onAttackStartRequest: () => appendLog('info', 'ataque retomado'),
            attackStatus: () => 'disabled',
          }),
        { signal: ac.signal, timeoutMs: TEST_TIMEOUT_MS },
      );
      // Modal closed mid-run — no UI to update.
      if (ac.signal.aborted) return;
      setRunState('success');
    } catch (err) {
      if (ac.signal.aborted) return;
      setRunError(translateScriptError(err));
      setRunState('error');
    } finally {
      setIsRunning(false);
      if (abortRef.current === ac) {
        abortRef.current = null;
      }
    }
  };

  const handleSave = (): void => {
    if (!stepId) return;
    const draft: StepDraft = { kind: 'script', name, language: 'js', source };
    const allSteps = useAppConfigStore.getState().config.steps ?? [];
    const siblings = allSteps.filter((s) => s.id !== stepId);
    const result = validateStepDraft(draft, { steps: allSteps, siblings, playerPos });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    abortRef.current?.abort();
    updateScriptStep(stepId, { name, source });
    closeStepEdit();
  };

  const handleClose = (): void => {
    abortRef.current?.abort();
    closeStepEdit();
  };

  // Step may have been removed while the modal was open — close without saving.
  if (isOpen && (!step || step.kind !== 'script')) {
    closeStepEdit();
    return null;
  }

  const pill = STATE_PILL[runState];
  const showError = runState === 'error' && runError;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="xl"
      className="h-[85vh] overflow-hidden"
      bodyClassName="flex min-h-0 flex-1 flex-col px-5 py-4"
      title={`Editar passo #${stepIndex + 1}`}
      headerAction={<DocsSplitButton />}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleRun}
            disabled={isRunning || macroIsRunning}
            className="mr-auto"
            title={macroIsRunning ? 'Pause o macro para testar o script' : undefined}
          >
            <PlayIcon className="h-4 w-4" />
            Testar
          </Button>
          <Button variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Salvar
          </Button>
        </>
      }
    >
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-400">Nome</span>
        <TextInput
          compact
          type="text"
          placeholder="CHECK_LAN_A_RANGE_1"
          value={name}
          onChange={(e) => {
            setName(normalizeMarkerName((e.target as HTMLInputElement).value));
          }}
          aria-label="Nome do script"
          className="w-full font-mono text-xs"
        />
        <span className="mt-1 block text-[10px] text-gray-500">A-Z, 0-9, separados por _</span>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <span className="mb-1 block text-xs font-medium text-gray-400">Source</span>
        <ScriptEditor
          value={source}
          onChange={setSource}
          height="100%"
          className="flex-1 overflow-hidden rounded border border-gray-700"
        />
      </div>

      <div className="mt-4 flex h-64 flex-col overflow-hidden rounded border border-gray-700 bg-gray-900">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-700 bg-gray-800 px-2 py-1.5">
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${pill.className}`}
          >
            {pill.label}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-amber-400/80">
            ⚠ comandos enviados ao servidor de verdade
          </span>
        </div>

        <div className="flex-1 overflow-auto px-2 py-1 font-mono text-xs">
          {runLogs.length === 0 && !showError && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
              <CommandLineIcon className="h-8 w-8 text-gray-600" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-400">Nenhum log registrado</span>
              <span className="text-xs text-gray-500">
                Use <span className="font-mono text-gray-400">ctx.log(...)</span> no script para ver
                mensagens aqui
              </span>
            </div>
          )}
          {runLogs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5">
              <span className="shrink-0 text-gray-500">{formatTime(log.ts)}</span>
              <span className={`w-10 shrink-0 uppercase ${LEVEL_COLORS[log.level]}`}>
                {log.level}
              </span>
              <span className="break-all text-gray-200">{log.message}</span>
            </div>
          ))}
          {showError && (
            <div className="flex items-start gap-2 py-0.5">
              <span className="w-10 shrink-0 text-red-400 uppercase">err</span>
              <span className="text-red-300">{runError}</span>
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </Modal>
  );
};
