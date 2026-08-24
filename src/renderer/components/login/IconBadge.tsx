import { type FC, type ReactNode } from 'react';

export type BadgeTone = 'error' | 'warn' | 'accent';

const TONE: Record<BadgeTone, { color: string; bg: string; ring: string }> = {
  error: {
    color: 'var(--color-red-500)',
    bg: 'rgba(239,68,68,0.12)',
    ring: 'rgba(239,68,68,0.28)',
  },
  warn: { color: 'var(--color-gold)', bg: 'rgba(234,179,8,0.12)', ring: 'rgba(234,179,8,0.28)' },
  accent: {
    color: 'var(--color-accent-400)',
    bg: 'rgba(59,130,246,0.12)',
    ring: 'rgba(59,130,246,0.28)',
  },
};

interface IconBadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

/** 38×38 tone-tinted icon badge for the gate card header. */
export const IconBadge: FC<IconBadgeProps> = ({ tone, children }) => {
  const t = TONE[tone];
  return (
    <span
      className="mb-px grid h-[38px] w-[38px] place-items-center rounded-[11px]"
      style={{ color: t.color, background: t.bg, boxShadow: `inset 0 0 0 1px ${t.ring}` }}
    >
      {children}
    </span>
  );
};
