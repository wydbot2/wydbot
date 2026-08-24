/**
 * Stale-speed predicted overshoot: renderer speed capture (macro-engine.ts) ->
 * main MovementState.
 *
 * Defect:
 *   src/renderer/lib/macro-engine.ts:215 — `dispatchMoveSequence` captures
 *   `const speed = usePlayerStore.getState().movementSpeed || 1` ONCE, outside
 *   the `for (;;)` chunk loop (:233), and reuses it for every chunk (:257).
 *   `movementSpeed` is mutable mid-session (player-store.ts:357,391 — 0x336
 *   RefreshScore: slow debuff / mount-dismount / buff). When speed drops mid-walk
 *   the renderer keeps emitting the stale-fast speedMove; main's commitMove paces
 *   `interpolateLeg` with `perTileMs(staleFastSpeed)` (movement-state.ts:68).
 *
 *   A normal completed walk is NEVER echoed and
 *   the ONLY `_confirmedTile` writers are setCharToWorld (once, session-manager.ts:109)
 *   + applyRubberband (correction, ipc-event-bridge.ts:227,239). So
 *   getPredictedPosition is pure OPEN-LOOP dead reckoning — every outbound move /
 *   attack / use-item src reads it — and the predicted tile advances at the
 *   stale-FAST pace while the server advances at the true SLOW pace. The drift
 *   grows monotonically until the server origin-snaps (|delta| >= 0x22).
 *
 * Expected: a 12-tile leg whose true speed is 3 should, at 2 s,
 *   have the predicted tile at x=6 (interpolateLeg paced by perTileMs(3)=333).
 * Actual: committed at the stale-fast speed 6 (perTileMs(6)=167), the
 *   predicted tile at 2 s is x=11 — 5 tiles AHEAD of the server.
 *
 * To fix: re-read `movementSpeed` per chunk (inside the loop) so each
 *   `commitMove` paces with the live speed; then flip the `it.fails` below to
 *   `it` once src/renderer/lib/macro-engine.ts:215 is corrected.
 *
 * These tests touch only the pure SoT primitives (MovementState.commitMove +
 * getPredictedPosition, perTileMs, interpolateLeg). No Electron / IPC. The clock
 * commitMove/getPredictedPosition read via Date.now() is injected with fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MovementState } from '@main/session/movement-state';
import { interpolateLeg, perTileMs } from '@shared/lib/movement-math';
import type { MPosition } from '@shared/types';

// The wall-clock instant commitMove / getPredictedPosition read via Date.now().
const T0 = 1_000_000_000_000;

describe('desync: stale captured movement speed -> open-loop predicted overshoot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Sanity-pin the two tier paces the whole proof rests on.
  it('pins the canonical per-tile paces (perTileMs(6)=167, perTileMs(3)=333)', () => {
    expect(perTileMs(6)).toBe(167);
    expect(perTileMs(3)).toBe(333);
  });

  // Characterization of the BUGGY pace: confirms commitMove dead-reckons at the
  // exact stale-fast speed it is handed, with no live-speed correction.
  it('characterizes the open-loop predicted leg at the stale-fast speed (x=11 at 2 s)', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 0, y: 0 });

    // Renderer captured speed=6 once (macro-engine.ts:215) and never refreshes it;
    // main paces the whole 12-tile leg at perTileMs(6)=167.
    ms.commitMove({ x: 12, y: 0 }, /* steps */ 12, /* STALE_FAST */ 6);

    // 1 s in: floor(1000/167)=5 → x=5.
    expect(ms.getPredictedPosition(T0 + 1000)).toEqual({ x: 5, y: 0 });

    // BUG: 2 s in: floor(2000/167)=11 → predicted x=11.
    //   correct would be x=6 (true speed 3, perTileMs 333 → floor(2000/333)=6).
    expect(ms.getPredictedPosition(T0 + 2000)).toEqual({ x: 11, y: 0 });
  });

  // PROOF: asserts the server-faithful position. The code is buggy, so the body
  // throws (predicted x=11 != server x=6) and `it.fails` turns that into a green
  // pass that documents the defect. It will START failing the day someone makes
  // commitMove pace with the live speed — flip to `it` then.
  it.fails(
    'PROOF: predicted should track the TRUE server pace (x=6 at 2 s), not the stale-fast pace',
    () => {
      const ms = new MovementState();
      const src: MPosition = { x: 0, y: 0 };
      const dst: MPosition = { x: 12, y: 0 };
      ms.setCharToWorld(src);

      // BUG: renderer hands the stale-fast speed 6; true in-session speed dropped to 3.
      ms.commitMove(dst, /* steps */ 12, /* STALE_FAST */ 6);

      const predicted = ms.getPredictedPosition(T0 + 2000);

      // Server-faithful reference: same leg paced at the TRUE speed (3).
      const serverTrue = interpolateLeg(src, dst, 12, perTileMs(/* TRUE */ 3), 2000);
      expect(serverTrue).toEqual({ x: 6, y: 0 });

      // The fix makes these equal. Today they diverge by 5 tiles (>= the 0x22 snap).
      expect(predicted).toEqual(serverTrue);
    },
  );

  // Quantifies the monotonic drift independent of the it.fails harness above:
  // the gap is already non-zero early and grows as the faster pace pulls ahead.
  it('quantifies monotonic drift: >= 1 early, >= 2 tiles ahead by 2 s, never shrinks', () => {
    const ms = new MovementState();
    const src: MPosition = { x: 0, y: 0 };
    const dst: MPosition = { x: 12, y: 0 };
    ms.setCharToWorld(src);
    ms.commitMove(dst, 12, /* STALE_FAST */ 6);

    const trueAt = (elapsed: number) =>
      interpolateLeg(src, dst, 12, perTileMs(/* TRUE */ 3), elapsed).x;
    const driftAt = (elapsed: number) => ms.getPredictedPosition(T0 + elapsed).x - trueAt(elapsed);

    // 0.5 s: fast=floor(500/167)=2, true=floor(500/333)=1 → already 1 ahead.
    expect(driftAt(500)).toBeGreaterThanOrEqual(1);
    // 2 s: fast x=11 vs true x=6 → 5 tiles ahead.
    expect(driftAt(2000)).toBeGreaterThanOrEqual(2);
    // Monotonic: later drift is never smaller than earlier drift on this leg.
    expect(driftAt(2000)).toBeGreaterThanOrEqual(driftAt(500));
  });

  // Milder stale gap (committed 6 vs true 5): no false drift at the shared 1 s
  // boundary, then it opens up by 2 s — guards against over-claiming early drift.
  it('no false early drift: committed-6 vs true-5 is equal at 1 s, then drifts by 2 s', () => {
    const ms = new MovementState();
    const src: MPosition = { x: 100, y: 100 };
    const dst: MPosition = { x: 220, y: 100 };
    ms.setCharToWorld(src);
    ms.commitMove(dst, 120, /* STALE_FAST */ 6);

    const trueAt = (elapsed: number) =>
      interpolateLeg(src, dst, 120, perTileMs(/* TRUE */ 5), elapsed).x;

    // 1 s: fast=floor(1000/167)=5, true=floor(1000/200)=5 → equal, no false drift.
    expect(ms.getPredictedPosition(T0 + 1000).x).toBe(trueAt(1000));
    // 2 s: fast=floor(2000/167)=11, true=floor(2000/200)=10 → 1 ahead.
    expect(ms.getPredictedPosition(T0 + 2000).x - trueAt(2000)).toBeGreaterThanOrEqual(1);
  });
});
