import type { MPosition } from '@shared/types';
import type { MacroStep } from '../stores/macro-types';

/* ── Handler interface ───────────────────────────────── */

export interface StepContext {
  playerPos: MPosition;
  speed: number;
  signal: AbortSignal;
}

export interface StepResult {
  delayMs: number;
  /**
   * Bypass the default `+1` advance and set `currentStepIndex` to this value.
   * Used by `executeScript` to honor `ctx.macro.goToMarker(...)` jumps.
   */
  jumpTo?: number;
}

export type ActionHandler = (step: MacroStep, ctx: StepContext) => Promise<StepResult>;
