/**
 * Main mover origin-coherence gate vs. cross-process predicted `src`.
 * src/main/protocol/command-sender.ts:168
 *
 *     const codesOrigin = sumCodes(slice.dest, slice.codes);        // :167
 *     if (codesOrigin.x !== src.x || codesOrigin.y !== src.y)       // :168
 *       return { status: 'replan', dst: src, cooldownMs: 0 };       // :169
 *
 * Cross-process context:
 *  - The renderer plans the route from `usePlayerStore.position` — the LAGGED
 *    33ms+IPC mirror (world-bridge.ts:217-223 writes it from the PLAYER_POSITION
 *    broadcast). It pushes the whole `{tiles, codes}` to main fire-and-forget
 *    via MOVE_SET_ROUTE (macro-engine.ts:198-206).
 *  - Main slices that route from its OWN `getPredictedPosition(Date.now())`,
 *    read at execute time inside `ClientControl.movement` (command-sender.ts:154)
 *    — a real-time dead-reckoned tile that runs AHEAD of the renderer mirror.
 *
 * Because the route is contiguous (`tiles[i+1] = tiles[i] + DIR_DELTA[codes[i]]`,
 * guaranteed by reconstructPath, walkability-service.ts:247-248), `sumCodes`
 * ALWAYS reconstructs `tiles[idx]` — the route tile `sliceRouteFrom` selected as
 * the nearest to `src` (route-slice.ts:18-24, Chebyshev-nearest, forward
 * tie-break). The gate therefore collapses to `tiles[idx] === src`.
 *
 * Expected: whenever `sliceRouteFrom` returns a NON-NULL forward slice, a
 *   0x36C leg is emitted (re-based on `src`) and the avatar advances — exactly
 *   as the straight-move path does (movementStraight only rejects on a >15-tile
 *   Chebyshev gap, never on off-line drift).
 * Without re-anchoring, any predicted drift of even one tile off the planned
 *   line — normal inter-process lag, or a tight wall-contour where the
 *   predicted sits equidistant to many route tiles — makes `tiles[idx] !== src`,
 *   so the mover returns 'replan' and emits ZERO packets: no `commitMove`, no
 *   forward progress this tick. The renderer's only recovery (`replanFrom`,
 *   macro-engine.ts:259-262) re-plans from the SAME lagged mirror and resets
 *   `lastPos = null` (macro-engine.ts:227-228), so the STALL guard and
 *   stale-walk circuit-breaker never fire.
 *
 * The mover RE-ANCHORS: when the codes-origin is within
 *   ORIGIN_REANCHOR_TOLERANCE of the predicted src, it sends the 0x36C with
 *   lastPosition = codesOrigin (coherent by construction; the server replays from
 *   the claimed origin, ≤0x22 drift tolerance) instead of a zero-packet replan.
 *   Drift > tolerance still replans. The cases below are regression locks for
 *   the re-anchored 'send'.
 *
 * Pure unit: the exported `sliceRouteFrom` (@main/session/route-slice) + a
 * faithful copy of the module-private `sumCodes` (command-sender.ts:59-67).
 * No Electron, no IPC, no timers.
 * ============================================================================
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sliceRouteFrom } from '@main/session/route-slice';
import { MovementState } from '@main/session/movement-state';
import { chebyshev, perTileMs } from '@shared/lib/movement-math';
import { ORIGIN_REANCHOR_TOLERANCE } from '@shared/constants/movement';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

const pos = (x: number, y: number): MPosition => ({ x, y });

/** Faithful copy of the module-private `sumCodes` (command-sender.ts:59-67). */
const sumCodes = (dest: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = dest;
  for (const c of codes) {
    x -= DIR_DELTA[c].x;
    y -= DIR_DELTA[c].y;
  }
  return { x, y };
};

/**
 * Mirror of `ClientControl.movement`'s decision after the predicted `src` is
 * read (command-sender.ts:163-170). 'send' = a 0x36C leg is emitted (forward
 * progress); 'replan' = the origin-coherence gate fires (zero packets).
 */
const gateOutcome = (route: StreamRoute, src: MPosition): 'send' | 'replan' | 'no-slice' => {
  const slice = sliceRouteFrom(route, src);
  if (!slice) return 'no-slice';
  const origin = sumCodes(slice.dest, slice.codes);
  // FIX (command-sender.ts): re-anchor the wire to the codes-origin when it is within
  // ORIGIN_REANCHOR_TOLERANCE of src; only farther (off-corridor) drift replans.
  return chebyshev(origin, src) <= ORIGIN_REANCHOR_TOLERANCE ? 'send' : 'replan';
};

/** Build a contiguous route by walking `codes` from `start` (the reconstructPath invariant). */
const buildRoute = (start: MPosition, codes: DirectionCode[]): StreamRoute => {
  const tiles: MPosition[] = [start];
  for (const c of codes) {
    const last = tiles[tiles.length - 1];
    tiles.push({ x: last.x + DIR_DELTA[c].x, y: last.y + DIR_DELTA[c].y });
  }
  return { tiles, codes, waypoints: [tiles.length - 1] };
};

describe('codes-origin-gate: origin-coherence gate vs. cross-process predicted src', () => {
  // (a) Server-faithful baseline that the current code ALSO satisfies — a plain
  //     it(): predicted exactly on a route tile reconstructs to src → 'send'.
  it('baseline: predicted EXACTLY on a route tile passes the gate (a 0x36C is sent)', () => {
    const route = buildRoute(pos(100, 100), Array<DirectionCode>(6).fill(DIR.E)); // (100..106, 100)
    const src = pos(102, 100); // on the planned line
    const slice = sliceRouteFrom(route, src);
    expect(slice).not.toBeNull();
    // sumCodes reconstructs tiles[idx] === src, so the gate passes.
    expect(sumCodes(slice!.dest, slice!.codes)).toEqual(src);
    expect(gateOutcome(route, src)).toBe('send');
  });

  // (b) FIXED — predicted drifted 1 tile off the planned line (normal IPC lag).
  //     The mover re-anchors lastPosition to the codes-origin (drift ≤ tolerance)
  //     and emits a forward leg instead of a zero-packet replan.
  it('FIXED: predicted drifted 1 tile off the line emits a re-anchored forward leg [command-sender.ts re-anchor]', () => {
    const route = buildRoute(pos(100, 100), Array<DirectionCode>(6).fill(DIR.E));
    const src = pos(102, 101); // one tile off the route's y-line

    // A valid FORWARD slice exists — sliceRouteFrom did NOT return null.
    const slice = sliceRouteFrom(route, src);
    expect(slice).not.toBeNull();
    expect(slice!.codes.length).toBeGreaterThan(0);
    // The reconstructed codes-origin is tiles[idx] = (103,100), NOT src — this
    // is precisely what makes the gate at command-sender.ts:168 fire.
    expect(sumCodes(slice!.dest, slice!.codes)).toEqual(pos(103, 100));

    // Re-anchored to codesOrigin (drift=1 ≤ tolerance) → a forward leg is emitted.
    expect(gateOutcome(route, src)).toBe('send');
  });

  // (c) FIXED — tight U-contour around a 1-wide wall: the predicted in the gap
  //     is Chebyshev-1 to 7 of 9 route tiles; the forward tie-break jumps idx to
  //     7. The codes-origin is 1 tile off src (≤ tolerance) → re-anchored send.
  it('FIXED: U-contour gap, predicted equidistant to 7 tiles emits a re-anchored forward leg [command-sender.ts re-anchor]', () => {
    // N N N E E S S S — a U around a vertical wall; the two arms are 2 tiles apart.
    const route = buildRoute(pos(50, 50), [DIR.N, DIR.N, DIR.N, DIR.E, DIR.E, DIR.S, DIR.S, DIR.S]);
    // Interior-of-the-U tile: where the predicted lands after a 1-tile drift
    // while contouring. It is Chebyshev-1 from SEVEN of the nine route tiles —
    // a structural ambiguity, not a one-off coordinate.
    const src = pos(51, 52);
    const within1 = route.tiles.filter(
      (t) => Math.max(Math.abs(t.x - src.x), Math.abs(t.y - src.y)) <= 1,
    );
    expect(within1.length).toBe(7);

    const slice = sliceRouteFrom(route, src);
    expect(slice).not.toBeNull();
    // "prefer forward on ties" (route-slice.ts:20-21) picks the HIGHEST idx (7),
    // skipping the up-arm + crossbar: the slice is a single South step to (52,50).
    expect(slice!.dest).toEqual(pos(52, 50));
    expect(slice!.codes).toEqual([DIR.S]);
    // codes-origin = tiles[7] = (52,51), not the predicted src (51,52).
    expect(sumCodes(slice!.dest, slice!.codes)).toEqual(pos(52, 51));

    // Re-anchored to codesOrigin (drift=1 ≤ tolerance) → a forward leg is emitted.
    expect(gateOutcome(route, src)).toBe('send');
  });
});

/**
 * SCOPE NOTE (correctness lens — why this is a high-severity STALL not a crash):
 * after 'replan' the mover does NOT `commitMove`, so main's `_predicted` is
 * frozen; once the prior leg's travel time elapses, `getPredictedPosition`
 * returns a STABLE tile (interpolateLeg returns `dst` for k>=steps,
 * movement-math.ts:98-100). The 33ms PLAYER_POSITION broadcast then drives the
 * renderer mirror to that same tile, and a subsequent `replanFrom` plans A* FROM
 * it — so `tiles[0] === src` and the gate re-passes. The defect is therefore a
 * REPLAN-CHURN window (bounded by the residual leg travel time, repeated every
 * tick the predicted re-drifts), during which the server sees zero 0x36C — not a
 * permanent deadlock. The two assertions below pin that self-healing edge so the
 * proof above is not mistaken for a hard hang.
 */
describe('codes-origin-gate: replanFrom re-bases the route on the live tile → gate re-passes', () => {
  it('a route replanned FROM the settled predicted src starts at src → idx 0 → send', () => {
    const src = pos(102, 101);
    const replanned = buildRoute(src, Array<DirectionCode>(4).fill(DIR.E)); // tiles[0] === src
    expect(replanned.tiles[0]).toEqual(src);
    expect(gateOutcome(replanned, src)).toBe('send');
  });

  it('mid-leg re-drift now re-anchors instead of churning (1 tile ≤ tolerance)', () => {
    const planFrom = pos(100, 100);
    const replanned = buildRoute(planFrom, Array<DirectionCode>(4).fill(DIR.E));
    const advancedSrc = pos(100, 101); // predicted 1 tile off the new route line
    expect(sliceRouteFrom(replanned, advancedSrc)).not.toBeNull();
    // FIX: a 1-tile mid-leg re-drift is ≤ tolerance → re-anchored send (no zero-packet churn).
    expect(gateOutcome(replanned, advancedSrc)).toBe('send');
  });
});

describe('codes-origin-gate FIX: re-anchor within tolerance, replan beyond', () => {
  it('drift of exactly 2 tiles still re-anchors → send', () => {
    // Route E×6 from (100,100); predicted 2 tiles off the y-line.
    const route = buildRoute(pos(100, 100), Array<DirectionCode>(6).fill(DIR.E));
    const src = pos(102, 102);
    const slice = sliceRouteFrom(route, src)!;
    const drift = chebyshev(sumCodes(slice.dest, slice.codes), src);
    expect(drift).toBe(2);
    expect(gateOutcome(route, src)).toBe('send');
  });

  it('drift of 3 tiles (off the planned corridor) still replans — a stale route is re-planned', () => {
    const route = buildRoute(pos(100, 100), Array<DirectionCode>(6).fill(DIR.E));
    const src = pos(102, 103); // 3 tiles off the line → genuinely off-corridor
    const slice = sliceRouteFrom(route, src)!;
    const drift = chebyshev(sumCodes(slice.dest, slice.codes), src);
    expect(drift).toBe(3);
    expect(gateOutcome(route, src)).toBe('replan');
  });
});

// Coherence + defect-#3 lock: the re-anchored leg starts at the EXACT wire src the
// mover sends, never a second-clock-read predicted tile. Drives the real MovementState.
describe('codes-origin-gate FIX: committed leg src == re-anchored wire src (no double-clock drift)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('commitMove honors the explicit wire src even when an older leg is mid-flight', () => {
    const ms = new MovementState();
    ms.setCharToWorld(pos(10, 10));
    const speed = 5; // perTileMs 200

    // Older leg in flight: advance ~2 tiles so the re-read predicted would be (12,10).
    ms.commitMove(pos(22, 10), 12, speed, Array<DirectionCode>(12).fill(DIR.E));
    vi.advanceTimersByTime(2 * perTileMs(speed) + 5);
    expect(ms.getPredictedPosition(Date.now())).toEqual(pos(12, 10));

    // Re-anchored commit: wire src is the codes-origin (11,10), 1 tile behind predicted.
    const wireSrc = pos(11, 10);
    ms.commitMove(pos(14, 10), 3, speed, [DIR.E, DIR.E, DIR.E], wireSrc);

    // The new leg starts at the explicit wire src (11,10) — NOT the re-read predicted (12,10).
    // Under the old double-clock commitMove this would have been (12,10) → +1 desync.
    expect(ms.getPredictedPosition(Date.now())).toEqual(wireSrc);
  });
});
