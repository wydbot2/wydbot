import { DIR_DELTA, type DirectionCode } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

/**
 * Chebyshev distance — canonical WYD2 gameplay metric.
 *
 * The server's pathfinder takes ±1 tile per step and counts diagonals as 1,
 * so max(|dx|, |dy|) is the true step count. See
 * for the RE reference.
 */
export const chebyshev = (a: MPosition, b: MPosition): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const euclidean = (a: MPosition, b: MPosition): number => Math.hypot(a.x - b.x, a.y - b.y);

const ATTACK_DIST_LUT: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6],
  [1, 1, 2, 3, 4, 5, 6],
  [2, 2, 3, 4, 4, 5, 6],
  [3, 3, 4, 4, 5, 5, 6],
  [4, 4, 4, 5, 5, 5, 6],
  [5, 5, 5, 5, 5, 6, 6],
  [6, 6, 6, 6, 6, 6, 6],
];

/** Distance the server uses to gate attack/interact range — diagonals cost Chebyshev+1 at range. */
export const attackDistance = (a: MPosition, b: MPosition): number => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx < 7 && dy < 7 ? ATTACK_DIST_LUT[dy][dx] : Math.max(dx, dy) + 1;
};

/** Server-side speed domain is [1, 7]; 0 clamps to 1. */
export const clampSpeed = (s: number): number => Math.min(Math.max(s, 1), 7);

/**
 * Settle margin added to walk cooldown — covers server-side animation overhead
 * + RTT + IPC jitter. 400 ms absorbs the "snap-to-dst then animate next"
 * symptom: a smaller pad assumed near-zero `server_unitMs - client_unitMs`
 * divergence, but empirical observation suggests server takes longer per tile
 * than our `1000/speed` estimate. The extra absorbs both per-tile underestimation
 * and the upload-leg latency (RTT_up) that the formula never modelled.
 */
export const WALK_CLICK_SAFETY_MS = 400;

/**
 * game cooldown floor:
 * - speed ≥ 6  →  100 ms (sprint / mount tiers)
 * - speed 4-5  →  500 ms (normal run)
 * - else       → 1000 ms (walk / debuff)
 *
 * Range comparisons match canonical exact-equality because clampSpeed pins to [1, 7].
 */
export const speedTierFloorMs = (speed: number): number => {
  if (speed >= 6) return 100;
  if (speed >= 4) return 500;
  return 1000;
};

export const perTileMs = (speed: number): number => Math.round(1000 / clampSpeed(speed));

export const calcMoveCooldownMs = (steps: number, speed: number): number =>
  Math.max(speedTierFloorMs(clampSpeed(speed)), steps * perTileMs(speed)) + WALK_CLICK_SAFETY_MS;

/**
 * Tiles the server walks for one 0x36C move — the single source of truth for
 * move travel distance (direction-code count for a contoured path, else the
 * straight-line Chebyshev). Both the cooldown and the enqueue estimate feed it
 * into `calcMoveCooldownMs` so their timing can't diverge.
 */
export const moveStepCount = (
  src: MPosition,
  dst: MPosition,
  directionCodes?: readonly DirectionCode[],
): number =>
  directionCodes && directionCodes.length > 0 ? directionCodes.length : chebyshev(src, dst);

/**
 * Dead-reckoned tile of an in-flight move leg after `elapsedMs`, stepping
 * tile-by-tile at `perTileMs`. With direction codes it follows the exact contour
 * (`DIR_DELTA`); without, it walks the straight Chebyshev diagonal. Clamps to
 * `dst` once the leg's travel time has elapsed. `perTileMs` must exclude the
 * launch-guard margin — it is the pure server pace `round(1000/speed)`.
 */
export const interpolateLeg = (
  src: MPosition,
  dst: MPosition,
  steps: number,
  perTileMs: number,
  elapsedMs: number,
  codes?: readonly DirectionCode[],
): MPosition => {
  if (steps <= 0 || perTileMs <= 0) return dst;
  const k = Math.max(0, Math.min(steps, Math.floor(elapsedMs / perTileMs)));
  if (k >= steps) return dst;
  if (codes && codes.length > 0) {
    let x = src.x;
    let y = src.y;
    for (let i = 0; i < k && i < codes.length; i++) {
      const d = DIR_DELTA[codes[i]];
      x += d.x;
      y += d.y;
    }
    return { x, y };
  }
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  return {
    x: src.x + Math.sign(dx) * Math.min(Math.abs(dx), k),
    y: src.y + Math.sign(dy) * Math.min(Math.abs(dy), k),
  };
};
