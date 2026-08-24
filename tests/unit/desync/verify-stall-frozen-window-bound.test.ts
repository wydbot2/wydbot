/**
 * The renderer STALL guard (STALL_MS=2000) false-trips if
 * the position mirror stays FROZEN for > STALL_MS while main keeps answering
 * `in-progress` via `isLegInFlight` (command-sender.ts:173-175) without advancing
 * the predicted position.
 *
 * The mechanism only holds IF the predicted position can stay pinned at one tile
 * (so the broadcaster, position-broadcaster.ts:43-44, dedups → frozen mirror)
 * WHILE `isLegInFlight` keeps returning true — for a window > STALL_MS=2000.
 *
 * These tests measure the ACTUAL bound of that joint window against the real
 * MovementState.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MovementState } from '@main/session/movement-state';
import { perTileMs } from '@shared/lib/movement-math';
import { DIR, type DirectionCode } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

const T0 = 2_000_000;
const STALL_MS = 2000;

/**
 * For a given leg, returns the longest contiguous window (ms) during which BOTH
 * (a) the predicted position equals the broadcast tile it had at window-start
 *     (i.e. the mirror would NOT have ticked a new tile — frozen), AND
 * (b) `isLegInFlight(predicted, codes, now)` returns true (command-sender would
 *     answer `in-progress` for an identical re-slice).
 *
 * Samples at 33ms (the broadcaster cadence) to mirror reality.
 */
const longestFrozenInFlightWindowMs = (
  steps: number,
  speed: number,
  codes: DirectionCode[],
  dst: MPosition,
): number => {
  const ms = new MovementState();
  const src: MPosition = { x: 100, y: 100 };
  vi.setSystemTime(T0);
  ms.setCharToWorld(src);
  ms.commitMove(dst, steps, speed, codes);

  let longest = 0;
  let windowStartMs = T0;
  let windowTile = ms.getPredictedPosition(T0);
  const travel = steps * perTileMs(speed);

  // Walk a little past the leg's travel time.
  for (let t = 0; t <= travel + 200; t += 33) {
    const now = T0 + t;
    const tile = ms.getPredictedPosition(now);
    const inFlight = ms.isLegInFlight(tile, codes, now);

    const tileSame = tile.x === windowTile.x && tile.y === windowTile.y;
    if (tileSame && inFlight) {
      longest = Math.max(longest, now - windowStartMs);
    } else {
      // Tile advanced (mirror would tick) OR leg no longer in flight → window resets.
      windowStartMs = now;
      windowTile = tile;
    }
  }
  return longest;
};

describe('VERIFY — frozen-mirror + isLegInFlight joint window is bounded by perTileMs, never > STALL_MS', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  // Every valid speed tier, with the worst case for "frozen": a single-tile leg
  // (the predicted sits on src for the full perTileMs before settling).
  for (let speed = 1; speed <= 7; speed++) {
    it(`speed ${speed}: 1-tile leg frozen-in-flight window <= perTileMs (${perTileMs(speed)}ms) and < STALL_MS`, () => {
      const w = longestFrozenInFlightWindowMs(1, speed, [DIR.E], { x: 101, y: 100 });
      // The joint window can never exceed one perTileMs: at elapsed >= perTileMs the
      // predicted advances to dst -> either the tile changes (mirror ticks) or the leg
      // has settled (isLegInFlight=false). Both end the window.
      expect(w).toBeLessThanOrEqual(perTileMs(speed));
      expect(w).toBeLessThan(STALL_MS);
    });
  }

  it('multi-tile slow leg (speed 1, 12 tiles, 12s travel): each tile holds only perTileMs, window still < STALL_MS', () => {
    // A long leg interpolates one tile per perTileMs. The mirror ticks every
    // perTileMs (1000ms at speed 1), so it is never frozen for > 1000ms even
    // though the whole leg lasts 12000ms. AND isLegInFlight only matches the
    // ORIGINAL src (p.src) — once predicted advances off src, isLegInFlight=false.
    const codes = Array.from({ length: 12 }, () => DIR.E) as DirectionCode[];
    const w = longestFrozenInFlightWindowMs(12, 1, codes, { x: 112, y: 100 });
    expect(w).toBeLessThan(STALL_MS);
  });

  it('once predicted advances past p.src, isLegInFlight(predicted,...) is false (src-equality gate, movement-state.ts:52)', () => {
    const ms = new MovementState();
    vi.setSystemTime(T0);
    ms.setCharToWorld({ x: 0, y: 0 });
    const codes = Array.from({ length: 12 }, () => DIR.E) as DirectionCode[];
    ms.commitMove({ x: 12, y: 0 }, 12, 1, codes); // 12s leg at speed 1

    // At t just over 1 perTile, predicted is at (1,0) — the SECOND command-sender
    // re-slice would pass src=(1,0); isLegInFlight checks p.src=(0,0) != (1,0) -> false.
    const now = T0 + perTileMs(1) + 1; // 1001ms
    const predicted = ms.getPredictedPosition(now);
    expect(predicted).toEqual({ x: 1, y: 0 }); // mirror would have TICKED to (1,0)
    expect(ms.isLegInFlight(predicted, codes, now)).toBe(false); // NOT skipped → re-slice/commit
  });
});
