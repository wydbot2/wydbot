/**
 * Companion to codes-origin-gate-noprogress-replan.test.ts, which pins the
 * mechanical claim: when main's predicted `src` is off the planned-route line,
 * the origin-coherence gate (command-sender.ts:167-170) returns `replan` with
 * ZERO 0x36C emitted, even though `sliceRouteFrom` produced a non-null forward
 * slice.
 *
 * This file answers whether the `replan` is a persistent no-progress loop
 * or a one-tick self-correcting blip.
 *
 * Recovery dynamics (macro-engine.ts:259-262 + movement-state.ts):
 *  - On `replan`, NO `commitMove` runs (command-sender.ts:169 returns before the
 *    send/commit). The main SoT `_predicted` leg is therefore UNCHANGED — it keeps
 *    interpolating the LAST committed leg and converges (clamps) to that leg's
 *    `dst` once its travel time elapses (movement-math.ts interpolateLeg:98-100).
 *  - The renderer calls `replanFrom()` → `planStreamRoute(target)` re-plans a NEW
 *    contiguous route whose `tiles[0]` == the renderer mirror (macro-engine.ts:199).
 *  - The renderer mirror is written ONLY by the PLAYER_POSITION broadcast
 *    (world-bridge.ts:218-222), which ships `getPredictedPosition(now)` every 33ms
 *    while interpolating + one settle tick (position-broadcaster.ts:36-48).
 *
 * So the question reduces to: once the in-flight leg SETTLES, do (a) main's
 * predicted `src` and (b) the freshly-planned route's `tiles[idx]` coincide so
 * the gate passes on the next tick? We model both the still-interpolating and the
 * settled states with the REAL pure modules (route-slice + movement-math
 * interpolateLeg), not mocks.
 */
import { describe, it, expect } from 'vitest';
import { sliceRouteFrom } from '@main/session/route-slice';
import { interpolateLeg, perTileMs } from '@shared/lib/movement-math';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

const pos = (x: number, y: number): MPosition => ({ x, y });

/** Faithful copy of command-sender.ts:59-67 `sumCodes`. */
const sumCodes = (dest: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = dest;
  for (const c of codes) {
    x -= DIR_DELTA[c].x;
    y -= DIR_DELTA[c].y;
  }
  return { x, y };
};

/** Mirror of command-sender.movement's decision once `src` is read. */
const gateOutcome = (route: StreamRoute, src: MPosition): 'send' | 'replan' | 'no-slice' => {
  const slice = sliceRouteFrom(route, src);
  if (!slice) return 'no-slice';
  const origin = sumCodes(slice.dest, slice.codes);
  return origin.x === src.x && origin.y === src.y ? 'send' : 'replan';
};

const buildRoute = (start: MPosition, codes: DirectionCode[]): StreamRoute => {
  const tiles: MPosition[] = [start];
  for (const c of codes) {
    const last = tiles[tiles.length - 1];
    tiles.push({ x: last.x + DIR_DELTA[c].x, y: last.y + DIR_DELTA[c].y });
  }
  return { tiles, codes, waypoints: [tiles.length - 1] };
};

describe('off-route gate self-correction on replanFrom()', () => {
  it('SETTLED leg: predicted == confirmed tile; renderer re-plans from THAT tile → gate passes next tick', () => {
    // Scenario: a leg from (100,100)→(104,100) committed at speed 3 (333ms/tile).
    // After ≥ steps*perTileMs the predicted clamps to dst (104,100). The broadcaster
    // ships that settled tile; the renderer mirror catches up to (104,100).
    const speed = 3;
    const startMs = 0;
    const leg = { src: pos(100, 100), dst: pos(104, 100), steps: 4, perTileMs: perTileMs(speed) };
    const settledNow = startMs + leg.steps * leg.perTileMs + 1; // past travel time
    const predicted = interpolateLeg(leg.src, leg.dst, leg.steps, leg.perTileMs, settledNow);
    expect(predicted).toEqual(pos(104, 100)); // clamped to dst — no further drift

    // Renderer re-plans the remaining path from its (now caught-up) mirror.
    const mirror = predicted; // broadcaster delivered the settled tile
    const newRoute = buildRoute(mirror, [DIR.E, DIR.E]); // (104..106,100)

    // Next tick: main slices the NEW route from its predicted == mirror == route[0].
    expect(gateOutcome(newRoute, predicted)).toBe('send'); // coherence RESTORED
  });

  it('the gate cannot loop forever: a replan does not commit a new leg, so predicted converges to the old dst and the next plan starts there', () => {
    // Model the U-contour stall from the sibling test, then run the recovery.
    const speed = 4;
    // The leg that WAS committed last (before the off-route tick) ends at (52,51).
    const committedLeg = {
      src: pos(50, 50),
      dst: pos(52, 51),
      steps: 3,
      perTileMs: perTileMs(speed),
    };
    // While that leg still interpolates, predicted is somewhere on the contour; the
    // renderer mirror lags. Suppose predicted briefly reads (51,52) → gate fires (proven
    // in sibling test). CRUCIAL: replan does NOT commit, so the SAME committedLeg keeps
    // running and clamps to its dst.
    const afterSettle = committedLeg.steps * committedLeg.perTileMs + 50;
    const predictedSettled = interpolateLeg(
      committedLeg.src,
      committedLeg.dst,
      committedLeg.steps,
      committedLeg.perTileMs,
      afterSettle,
    );
    expect(predictedSettled).toEqual(pos(52, 51)); // converged — drift is bounded

    // Renderer replans from the settled mirror (52,51): a fresh contiguous route.
    const recoveryRoute = buildRoute(pos(52, 51), [DIR.E, DIR.E, DIR.S]);
    // Coherence holds on the settled tick: predicted == route[0].
    expect(gateOutcome(recoveryRoute, predictedSettled)).toBe('send');
  });

  it('CAVEAT — the window is non-empty: at sprint speed the per-tile pace (167ms) is short, but the gate STILL only fires while a stale route is live AND predicted is mid-contour; it clears at settle', () => {
    // Demonstrate that the divergence is transient by construction: interpolateLeg
    // is monotone toward dst and clamps. There is no committed leg during a replan,
    // so predicted is a FIXED function of (frozen leg, now) — it cannot diverge
    // unboundedly; it can only approach dst.
    const speed = 6;
    const leg = { src: pos(200, 200), dst: pos(208, 200), steps: 8, perTileMs: perTileMs(speed) };
    let prev = -1;
    for (let t = 0; t <= leg.steps * leg.perTileMs + 100; t += leg.perTileMs) {
      const p = interpolateLeg(leg.src, leg.dst, leg.steps, leg.perTileMs, t);
      // Monotone non-decreasing x, never overshoots dst.
      expect(p.x).toBeGreaterThanOrEqual(prev);
      expect(p.x).toBeLessThanOrEqual(leg.dst.x);
      prev = p.x;
    }
    // The endpoint is exactly dst — convergence is guaranteed.
    const end = interpolateLeg(
      leg.src,
      leg.dst,
      leg.steps,
      leg.perTileMs,
      leg.steps * leg.perTileMs,
    );
    expect(end).toEqual(leg.dst);
  });
});
