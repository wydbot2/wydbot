/** Macro runtime status. Declared outside `macro-types.ts` (ESLint `local/types-file-only-exports`). */
export const MacroStatus = {
  Idle: 'idle',
  Running: 'running',
  Paused: 'paused',
} as const;

export type MacroStatus = (typeof MacroStatus)[keyof typeof MacroStatus];
