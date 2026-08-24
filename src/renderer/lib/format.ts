import type { MPosition } from '@shared/types';

/** Canonical user-facing position format. Example: "1234x, 2345y". */
export const formatPosition = (pos: MPosition): string => `${pos.x}x, ${pos.y}y`;

/** Seconds → "m:ss" (default) or "Xh:MM" once the duration crosses an hour. */
export const formatRemaining = (sec: number): string => {
  if (sec >= 3600)
    return `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
