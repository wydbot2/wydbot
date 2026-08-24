import { type FC } from 'react';
import type { BootStage } from '@shared/ipc/ipc-api';
import { Logo } from '../shared/Logo';
import { useBootProgress } from '../../hooks/use-boot-progress';
import { useAppVersion } from '../../hooks/use-app-version';
import { getWydAPI } from '../../lib/electron-api';

const STATE_TOKEN: Record<BootStage, string> = {
  'window-create': 'inicializando',
  'assets-checking': 'verificando',
  'assets-downloading': 'baixando',
  'assets-extracting': 'extraindo',
  icons: 'carregando',
  maps: 'carregando',
  amul: 'carregando',
  itemdb: 'carregando',
  ready: 'pronto',
  error: 'erro',
};

const PULSING_STAGES: ReadonlySet<BootStage> = new Set([
  'window-create',
  'assets-checking',
  'assets-downloading',
  'assets-extracting',
  'icons',
  'maps',
  'amul',
  'itemdb',
]);

const barTransition = 'width 240ms cubic-bezier(0.16, 1, 0.3, 1)';

const WarnIcon: FC = () => (
  <svg width={16} height={16} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
    />
  </svg>
);

export const SplashScreen: FC = () => {
  const progress = useBootProgress();
  const version = useAppVersion();
  const isError = progress.stage === 'error';
  const isReady = progress.stage === 'ready';
  const isAssetStage =
    progress.stage === 'assets-checking' ||
    progress.stage === 'assets-downloading' ||
    progress.stage === 'assets-extracting';
  const stateToken = STATE_TOKEN[progress.stage] ?? 'carregando';
  const percent = Math.max(0, Math.min(100, progress.percent));

  const dotStyle = isError
    ? { background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.55)' }
    : isReady
      ? { background: '#22d3ee', boxShadow: '0 0 6px rgba(34,211,238,0.55)' }
      : { background: 'var(--color-accent-500)', boxShadow: '0 0 6px rgba(59,130,246,0.55)' };

  const handleRetry = (): void => {
    getWydAPI()?.retryBoot();
  };

  const handleContinueDegraded = (): void => {
    getWydAPI()?.continueBootDegraded();
  };

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-gray-900 select-none"
      role="dialog"
      aria-label="Carregando WYDBot"
    >
      {/* Subtle blue vignette at top */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -10%, rgba(59,130,246,0.06), transparent 60%)',
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-[22px] pt-5">
        <Logo />
        {version && (
          <span
            className="rounded border border-gray-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-500"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            v{version}
          </span>
        )}
      </header>

      {isError ? (
        <div className="relative z-10 mx-[22px] mt-[14px] flex flex-1 flex-col gap-[10px]">
          {/* Error card */}
          <div
            className="flex items-start gap-[10px] rounded-md px-3 py-[10px]"
            style={{
              background: 'rgba(127,29,29,0.18)',
              border: '1px solid rgba(220,38,38,0.35)',
              borderLeft: '3px solid #ef4444',
            }}
          >
            <span className="mt-px flex-shrink-0 text-red-400">
              <WarnIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-xs font-semibold text-red-300">{progress.label}</div>
              {progress.errorCode && (
                <div
                  className="font-mono text-[11px] break-words text-red-300"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {progress.errorCode}
                </div>
              )}
            </div>
          </div>

          {/* Hint */}
          {progress.errorHint && (
            <p className="pl-0.5 text-[11px] text-gray-500">{progress.errorHint}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={handleRetry}
              className="cursor-pointer rounded border px-[10px] py-1 font-sans text-[11px] font-medium text-white transition-colors"
              style={{
                background: 'var(--color-accent-600, #2563eb)',
                borderColor: 'var(--color-accent-700, #1d4ed8)',
              }}
            >
              Tentar novamente
            </button>
            {progress.canContinueDegraded && (
              <button
                onClick={handleContinueDegraded}
                className="cursor-pointer rounded border border-gray-700 px-[10px] py-1 font-sans text-[11px] font-medium text-gray-300 transition-colors hover:text-white"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                Continuar com dados anteriores
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 flex-col justify-center gap-[14px] px-[22px] pt-[18px]">
          {/* Phase info — title then sub-detail above the bar */}
          <div className="flex flex-col gap-1">
            <p className="text-sm leading-snug font-semibold text-gray-100">{progress.label}</p>
            <p className="min-h-[1.4em] overflow-hidden font-mono text-[11px] text-ellipsis whitespace-nowrap text-gray-500">
              {progress.detail ?? ' '}
            </p>
          </div>

          <div
            className="relative h-[3px] w-full overflow-hidden rounded-full"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${percent}%`,
                background: 'var(--color-accent-500)',
                transition: barTransition,
                boxShadow: '0 0 8px rgba(59,130,246,0.55)',
              }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={progress.label}
            />
          </div>
        </div>
      )}

      <footer
        className="relative z-10 flex items-center justify-between border-t border-gray-800 px-[22px] pt-[10px] pb-[14px] font-mono text-[10px] text-gray-500"
        style={{ background: 'rgba(0,0,0,0.15)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${PULSING_STAGES.has(progress.stage) || isError ? 'animate-soft-pulse' : ''}`}
            style={dotStyle}
          />
          <span className="tracking-[0.06em] lowercase">{stateToken}</span>
        </div>
        {!isAssetStage && (
          <span className="text-gray-400">
            {Math.min(progress.stageIndex + 1, progress.stageCount)}/{progress.stageCount} módulos
          </span>
        )}
      </footer>
    </div>
  );
};
