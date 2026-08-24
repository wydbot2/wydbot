/** Walker stall-recovery accountant (window, backoff, skip/pause, tile blacklist). */
import type { MPosition } from '@shared/types';
import { WORLD_SIZE } from '@shared/ipc/walkability';
import type { MoveRejectionReason } from './macro-events';

export const RECOVERY_WINDOW_MS = 30_000;
/**
 * Pause when the window holds MORE than this many counted rejections AND they span
 * at least RECOVERY_PAUSE_DISTINCT_STEPS distinct steps (systemic stall).
 */
export const RECOVERY_MAX_REJECTS = 3;
/** Pause is systemic-only: the window must cover at least this many distinct step indexes. */
export const RECOVERY_PAUSE_DISTINCT_STEPS = 2;
/** Rejections closer than this to the previous counted one are ripple — not counted. */
export const REJECT_RIPPLE_MS = 1000;
export const PER_STEP_MAX_REJECTS = 6;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 4000;
export const AVOID_TILE_TTL_MS = 20_000;
export const AVOID_TILE_CAP = 32;

export type RecoveryVerdict =
  | {
      action: 'retry';
      backoffMs: number;
      deduped: boolean;
      windowCount: number;
    }
  | { action: 'skip-step' }
  | { action: 'pause'; windowReasons: readonly MoveRejectionReason[] };

interface CountedRejection {
  at: number;
  reason: MoveRejectionReason;
  stepIndex: number;
}

export interface WalkRecoverySnapshot {
  window: readonly CountedRejection[];
  consecutiveFailures: number;
  perStep: { stepIndex: number; count: number } | null;
  avoidCount: number;
}

let rejections: CountedRejection[] = [];
let consecutiveFailures = 0;
let perStepIndex: number | null = null;
let perStepCount = 0;
// Map insertion order drives LRU eviction past AVOID_TILE_CAP.
let avoidTiles = new Map<number, number>();

export const tileKey = (pos: MPosition): number => pos.y * WORLD_SIZE + pos.x;

const currentBackoffMs = (): number =>
  Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, consecutiveFailures - 1), BACKOFF_MAX_MS);

const pruneWindow = (now: number): void => {
  while (rejections.length > 0 && now - rejections[0].at > RECOVERY_WINDOW_MS) rejections.shift();
};

const pruneAvoid = (now: number): void => {
  for (const [key, expiresAt] of avoidTiles) {
    if (expiresAt <= now) avoidTiles.delete(key);
  }
};

/**
 * Pause is checked before per-step skip and only fires when the full window spans
 * multiple steps (systemic stall); a same-step streak escalates to skip-step instead.
 */
export const recordRejection = (
  reason: MoveRejectionReason,
  stepIndex: number,
  now = Date.now(),
): RecoveryVerdict => {
  pruneWindow(now);

  const last = rejections[rejections.length - 1];
  if (last && now - last.at < REJECT_RIPPLE_MS) {
    return { action: 'retry', backoffMs: currentBackoffMs(), deduped: true, windowCount: 0 };
  }

  rejections.push({ at: now, reason, stepIndex });
  consecutiveFailures += 1;
  if (stepIndex === perStepIndex) perStepCount += 1;
  else {
    perStepIndex = stepIndex;
    perStepCount = 1;
  }

  const distinctSteps = new Set(rejections.map((r) => r.stepIndex)).size;
  if (rejections.length > RECOVERY_MAX_REJECTS && distinctSteps >= RECOVERY_PAUSE_DISTINCT_STEPS) {
    return { action: 'pause', windowReasons: rejections.map((r) => r.reason) };
  }
  if (perStepCount >= PER_STEP_MAX_REJECTS) {
    return { action: 'skip-step' };
  }
  return {
    action: 'retry',
    backoffMs: currentBackoffMs(),
    deduped: false,
    windowCount: rejections.length,
  };
};

export const noteWalkerSuccess = (): void => {
  rejections.shift();
  consecutiveFailures = 0;
  perStepIndex = null;
  perStepCount = 0;
};

export const resetWalkRecovery = (): void => {
  rejections = [];
  consecutiveFailures = 0;
  perStepIndex = null;
  perStepCount = 0;
};

/**
 * Picks the route tiles to blacklist after an off-corridor rubberband: up to
 * `maxTiles` INTERMEDIATE tiles ahead of the corrected position. The route's
 * origin (index 0 — where the player stands) and its goal (last tile) are
 * never returned: avoiding the tile you stand on is meaningless, and avoiding
 * the goal would make the step itself unplannable. Routes of ≤2 tiles yield
 * nothing — there is no corridor left to contour.
 */
export const computeAvoidPrefix = (
  routeTiles: readonly MPosition[],
  maxTiles: number,
): MPosition[] => routeTiles.slice(1, -1).slice(0, maxTiles);

export const addAvoidTiles = (tiles: readonly MPosition[], now = Date.now()): void => {
  pruneAvoid(now);
  const expiresAt = now + AVOID_TILE_TTL_MS;
  for (const tile of tiles) {
    const key = tileKey(tile);
    avoidTiles.delete(key); // re-insert so LRU eviction treats it as newest
    avoidTiles.set(key, expiresAt);
  }
  while (avoidTiles.size > AVOID_TILE_CAP) {
    const oldest = avoidTiles.keys().next();
    if (oldest.done) break;
    avoidTiles.delete(oldest.value);
  }
};

export const consumeAvoidSet = (now = Date.now()): ReadonlySet<number> => {
  pruneAvoid(now);
  return new Set(avoidTiles.keys());
};

export const clearAvoidTiles = (): void => {
  avoidTiles = new Map<number, number>();
};

export const getWalkRecoverySnapshot = (): WalkRecoverySnapshot => ({
  window: [...rejections],
  consecutiveFailures,
  perStep: perStepIndex === null ? null : { stepIndex: perStepIndex, count: perStepCount },
  avoidCount: avoidTiles.size,
});
