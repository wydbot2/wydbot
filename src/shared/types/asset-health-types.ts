/**
 * Cross-layer contract for game-asset parse health.
 *
 * When a binary asset (ItemList, extraitem, SkillData, …) fails to parse — a
 * format the shipped client can't decode after a game patch — the failure is
 * carried as data (never a thrown crash) from the main process to the renderer,
 * which surfaces it as an ON-SCREEN error/banner. This is the "fail-visible,
 * never silently proceed on stale data" contract in type form.
 */

export type AssetFormatReason =
  | 'unknown-layout'
  | 'ambiguous-stride'
  | 'truncated'
  | 'empty'
  | 'implausible-count'
  | 'decode-failed';

/** One asset that could not be parsed, with enough detail to name it on screen. */
export interface AssetFailure {
  readonly asset: string;
  readonly reason: AssetFormatReason;
  readonly expected: string;
  readonly actual: string;
  readonly detail?: string;
}

/** Degraded-state signal: present when ≥1 boot-critical asset failed to parse. */
export interface AssetHealth {
  readonly failures: readonly AssetFailure[];
}
