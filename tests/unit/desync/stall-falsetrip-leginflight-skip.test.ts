/**
 * The renderer STALL guard false-trips into a `stale-walk`
 * rejection during a legitimately in-flight leg that main keeps SKIPPING
 * (`isLegInFlight`) or repeatedly answers `in-progress` for, without committing
 * a new leg.
 *
 * The seam (macro-engine.ts:244-274, dispatchMoveSequence loop):
 *   - `cur = usePlayerStore.position` (the mirror) — written ONLY by the main
 *     position broadcast (world-bridge.ts:218). The broadcaster (position-
 *     broadcaster.ts:36-44) ticks ONLY while `isInterpolating`, dedups identical
 *     tiles, and goes idle once a leg settles. So if main commits no new leg the
 *     mirror is FROZEN.
 *   - STALL guard (macro-engine.ts:249-254): if `cur === lastPos` for
 *     `> STALL_MS (2000)` it throws `MoveRejectedError('stale-walk')`.
 *   - The `in-progress` branch (macro-engine.ts:264) does `chunkRetries = 0` and
 *     continues — it does NOT call `replanFrom()`, so `lastPos`/`lastMovedAt`
 *     are NOT reset (only `replan`/`no-route` reset them, macro-engine.ts:259-262
 *     → replanFrom:227-228).
 *
 * When does main answer `in-progress` without advancing the predicted? When
 * `isLegInFlight` (movement-state.ts:49-55) skips a re-slice identical to the
 * leg still in flight (command-sender.ts:173-175 returns `in-progress`, no
 * commit, no broadcast advance). The predicted clamps at the leg's dst until the
 * leg's travel time elapses; for a slow tier the mirror can sit on one tile past
 * STALL_MS while the loop keeps getting `in-progress`.
 *
 * Expected behaviour: the avatar IS moving (or legitimately waiting out
 * the in-flight leg) — no stall. Actual: a `stale-walk` is raised, which feeds
 * the circuit-breaker (macro-engine.ts:512-538) toward a macro pause.
 *
 * This test replicates the loop's STALL state machine against a frozen mirror
 * and the real STALL_MS constant. Fake timers; no Electron / IPC.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MovementState } from '@main/session/movement-state';
import type { MPosition } from '@shared/types';

const T0 = 2_000_000;
/** Mirror of macro-engine.ts:186. */
const STALL_MS = 2000;

/** The loop's STALL state machine (macro-engine.ts:249-254), extracted verbatim. */
class StallTracker {
  private lastPos: MPosition | null = null;
  private lastMovedAt = Date.now();
  /** Returns true iff the guard would THROW stale-walk this iteration. */
  step(cur: MPosition): boolean {
    if (this.lastPos === null || cur.x !== this.lastPos.x || cur.y !== this.lastPos.y) {
      this.lastPos = cur;
      this.lastMovedAt = Date.now();
      return false;
    }
    return Date.now() - this.lastMovedAt > STALL_MS;
  }
  /** What `replanFrom()` does (macro-engine.ts:227-228) — reset the tracker. */
  reset(): void {
    this.lastPos = null;
    this.lastMovedAt = Date.now();
  }
}

describe('H6 — STALL guard false-trips while a leg is legitimately in-flight (isLegInFlight skip)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('isLegInFlight skips the re-slice for the whole travel window — predicted (and mirror) stays clamped on one tile', () => {
    const ms = new MovementState();
    const src: MPosition = { x: 10, y: 10 };
    ms.setCharToWorld(src);

    // A 1-tile leg at speed 1: perTileMs = 1000, so interpolateLeg returns `src`
    // for elapsed in [0, 1000) (k = floor(elapsed/1000) = 0).
    const codes = [0x36 as const]; // E
    const dst: MPosition = { x: 11, y: 10 };
    ms.commitMove(dst, 1, 1, codes);

    // Within the travel window the predicted is pinned to src AND a re-slice
    // identical to the in-flight leg is suppressed.
    for (const t of [0, 200, 500, 900]) {
      const now = T0 + t;
      expect(ms.getPredictedPosition(now)).toEqual(src); // mirror would broadcast `src`
      expect(ms.isLegInFlight(src, codes, now)).toBe(true); // command-sender returns 'in-progress'
    }
  });

  it('DESYNC: a frozen mirror + repeated `in-progress` (no replan) trips stale-walk after STALL_MS', () => {
    const tracker = new StallTracker();
    // The mirror the renderer reads. While main answers `in-progress` and the
    // predicted is clamped, the broadcaster sends nothing new → frozen.
    const frozenMirror: MPosition = { x: 10, y: 10 };

    // Loop iteration 1 (t=0): first observation, arms the tracker.
    expect(tracker.step(frozenMirror)).toBe(false);

    // The `in-progress` branch does NOT reset the tracker (only replan/no-route do).
    // Advance time while every loop iteration sees the SAME frozen tile.
    vi.setSystemTime(T0 + 1500);
    expect(tracker.step(frozenMirror)).toBe(false); // under budget

    vi.setSystemTime(T0 + STALL_MS + 1); // 2001 ms of no mirror movement
    // SERVER-FAITHFUL: the leg is in flight / waiting it out — NOT a stall.
    // ACTUAL (buggy): the guard throws stale-walk.
    expect(tracker.step(frozenMirror)).toBe(true);
  });

  it('contrast: a `replan` answer WOULD reset the tracker (replanFrom) and avoid the false-trip — proves the in-progress path is the gap', () => {
    const tracker = new StallTracker();
    const frozenMirror: MPosition = { x: 10, y: 10 };

    expect(tracker.step(frozenMirror)).toBe(false);
    vi.setSystemTime(T0 + 1500);
    // A replan/no-route chunk resets lastPos/lastMovedAt (macro-engine.ts:259-262).
    tracker.reset();

    vi.setSystemTime(T0 + STALL_MS + 1);
    // Because the tracker was reset, the same elapsed time does NOT trip.
    expect(tracker.step(frozenMirror)).toBe(false);
  });
});
