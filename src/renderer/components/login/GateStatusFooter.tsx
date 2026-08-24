import { type CSSProperties, type FC } from 'react';
import { useAppVersion } from '../../hooks/use-app-version';

export type GateFooterTone = 'neutral' | 'accent' | 'error' | 'warn';

interface GateStatusFooterProps {
  /** Lowercase mono state token (e.g. "aguardando login"). */
  state: string;
  tone: GateFooterTone;
}

const DOT: Record<GateFooterTone, { style: CSSProperties; pulse: boolean }> = {
  neutral: { style: { background: 'var(--color-gray-500)' }, pulse: false },
  accent: {
    style: { background: 'var(--color-accent-500)', boxShadow: '0 0 6px rgba(59,130,246,0.6)' },
    pulse: true,
  },
  error: {
    style: { background: 'var(--color-red-500)', boxShadow: '0 0 6px rgba(239,68,68,0.6)' },
    pulse: true,
  },
  warn: {
    style: { background: 'var(--color-gold)', boxShadow: '0 0 6px rgba(234,179,8,0.6)' },
    pulse: false,
  },
};

/** Footer strip for the auth card: tone dot + mono state token + version pill. */
export const GateStatusFooter: FC<GateStatusFooterProps> = ({ state, tone }) => {
  const version = useAppVersion();
  const dot = DOT[tone];

  return (
    <div
      className="relative z-[1] flex items-center justify-between gap-[10px] border-t border-gray-800 px-4 py-[9px] font-mono text-[10px] text-gray-500"
      style={{ background: 'rgba(0,0,0,0.2)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot.pulse ? 'animate-gate-pulse' : ''}`}
          style={dot.style}
        />
        <span className="tracking-[0.05em] lowercase">{state}</span>
      </div>
      {version && (
        <span
          className="rounded-[5px] border border-gray-800 px-1.5 py-0.5 tracking-[0.04em] text-gray-500"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          v{version}
        </span>
      )}
    </div>
  );
};
