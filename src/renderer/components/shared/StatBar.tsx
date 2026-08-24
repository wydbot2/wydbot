import { type FC, useEffect, useRef, useState } from 'react';

export interface StatBarProps {
  label: string;
  value: number;
  max: number;
  /** CSS background string: hex, rgb, gradient, or `var(--token)`. NOT a Tailwind class. */
  color: string;
  height?: number;
  hideHeader?: boolean;
  shimmer?: boolean;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

const fillTransition = 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)';

const glossOverlay =
  'linear-gradient(180deg, rgb(255 255 255 / 0.22), transparent 45%, rgb(0 0 0 / 0.25))';

const shimmerGradient = 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.28), transparent)';

export const StatBar: FC<StatBarProps> = ({
  label,
  value,
  max,
  color,
  height = 8,
  hideHeader = false,
  shimmer = true,
}) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const prevPctRef = useRef(pct);
  const [ghost, setGhost] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const prev = prevPctRef.current;
    if (pct < prev - 0.5) {
      setGhost({ from: pct, to: prev });
      prevPctRef.current = pct;
      const id = setTimeout(() => setGhost(null), 700);
      return () => clearTimeout(id);
    }
    prevPctRef.current = pct;
  }, [pct]);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {!hideHeader && (
        <div className="flex items-baseline justify-between gap-2 text-[11px]">
          <span className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase">
            {label}
          </span>
          <span className="text-[11px] text-gray-300">
            {fmt(value)} / {fmt(max)}
          </span>
        </div>
      )}
      <div
        className="relative w-full overflow-hidden rounded-full border border-gray-700/60 bg-gray-900/70"
        style={{ height: `${height}px` }}
      >
        {ghost && (
          <div
            className="pointer-events-none absolute inset-y-0 animate-pp-ghost bg-red-400/55"
            style={{ left: `${ghost.from}%`, width: `${ghost.to - ghost.from}%` }}
          />
        )}
        <div
          className="relative h-full overflow-hidden rounded-full"
          style={{ width: `${pct}%`, background: color, transition: fillTransition }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={`${label}: ${value} de ${max}`}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: glossOverlay }}
          />
          {shimmer && pct > 12 && (
            <div
              className="pointer-events-none absolute inset-y-0 w-[38%] animate-pp-shimmer"
              style={{ background: shimmerGradient }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
