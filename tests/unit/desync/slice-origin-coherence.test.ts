/**
 * Origin-coherence gate mechanics.
 *
 * The main mover gates each chunk by reconstructing the slice's codes-origin and
 * demanding it equal the wire `src` (command-sender.ts:167-170):
 *
 *     const codesOrigin = sumCodes(slice.dest, slice.codes);   // line 167
 *     if (codesOrigin.x !== src.x || codesOrigin.y !== src.y)  // line 168
 *       return { status: 'replan', ... };                      // line 169  → ZERO 0x36C
 *
 * Because a `StreamRoute` satisfies `tiles[i+1] = tiles[i] + DIR_DELTA[codes[i]]`
 * (walkability-service reconstructPath; route-slice.ts header), `sumCodes(slice.dest,
 * slice.codes)` ALWAYS reconstructs `tiles[idx]` — the route tile `sliceRouteFrom`
 * picked as nearest to `cur`. So the gate is really asserting `tiles[idx] === src`,
 * i.e. the predicted position must sit EXACTLY on a route tile. The instant predicted
 * drifts one tile off the planned line, the gate fires and no packet goes out.
 *
 * This file isolates the pure seam (`sliceRouteFrom` + the public
 * `sumCodes` formula). It pins:
 *   1. the reconstruction invariant (server-faithful: codes-origin == tiles[idx]);
 *   2. the forward tie-break OVERSHOOT (route-slice.ts:20 `i > idx`) that, for an
 *      off-line `cur` equidistant between tiles[idx] and tiles[idx+1], bumps idx
 *      AHEAD of the drifted src and guarantees the gate fires.
 *
 * The canonical client builds each move from its own current position, so
 * codes-origin == src by construction — it never stalls on an off-line origin.
 * Our architecture instead stores a whole renderer-planned route and slices it
 * from main's predicted; the gate is the guard for that cross-process split.
 * (The drift that fires the gate is NOT the commit-move double-clock — that
 * produces only an ON-LINE +1 tile, which passes;
 * see codes-origin-gate-systemproduced-diag / commit-move-double-clock. The real
 * trigger is a cross-route replan-while-in-flight, a 1-tile mirror/predicted lag;
 * see codes-origin-gate-runtime-repro.)
 *
 * Pure: `sliceRouteFrom` (exported) + a faithful copy of the module-private
 * `sumCodes` (command-sender.ts:59-67), reconstructed from public DIR_DELTA.
 */
import { describe, it, expect } from 'vitest';
import { sliceRouteFrom } from '@main/session/route-slice';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

const pos = (x: number, y: number): MPosition => ({ x, y });

/** Faithful copy of command-sender.ts:59-67 `sumCodes` (module-private there). */
const sumCodes = (dest: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = dest;
  for (const c of codes) {
    x -= DIR_DELTA[c].x;
    y -= DIR_DELTA[c].y;
  }
  return { x, y };
};

/** Mirror of command-sender.movement's gate after the slice is taken. */
const gateOutcome = (route: StreamRoute, src: MPosition): 'send' | 'replan' | 'no-slice' => {
  const slice = sliceRouteFrom(route, src);
  if (!slice) return 'no-slice';
  const origin = sumCodes(slice.dest, slice.codes);
  return origin.x === src.x && origin.y === src.y ? 'send' : 'replan';
};

// Straight EAST corridor: tiles (10,10)..(20,10), codes [E×10], single waypoint at the end.
const route: StreamRoute = {
  tiles: Array.from({ length: 11 }, (_, i) => pos(10 + i, 10)),
  codes: Array<DirectionCode>(10).fill(DIR.E),
  waypoints: [10],
};

describe('slice-origin-coherence — reconstruction invariant (server-faithful)', () => {
  it('cur EXACTLY on a route tile: codes-origin reconstructs to cur → gate passes (a 0x36C is sent)', () => {
    const cur = pos(13, 10); // tiles[3]
    const slice = sliceRouteFrom(route, cur)!;
    // Forward-clamped to the waypoint: dest = tiles[10], codes = E×7.
    expect(slice.dest).toEqual(pos(20, 10));
    expect(slice.codes).toHaveLength(7);
    // sumCodes walks the deltas backward and lands EXACTLY on tiles[idx] == cur.
    expect(sumCodes(slice.dest, slice.codes)).toEqual(cur);
    expect(gateOutcome(route, cur)).toBe('send');
  });
});

describe('slice-origin-coherence — 1-tile off-line drift fires the gate + forward tie-break overshoots', () => {
  it('cur one tile off the y-line: forward tie-break bumps idx AHEAD → codes-origin overshoots cur.x → replan (ZERO packets)', () => {
    const cur = pos(13, 11); // one tile north of the route line
    // cur is Chebyshev-1 from tiles[2],[3],[4]; route-slice.ts:20 `i > idx` picks idx=4.
    const slice = sliceRouteFrom(route, cur)!;
    // A valid FORWARD slice exists (not null) — the leg COULD be re-based and sent.
    expect(slice.codes.length).toBeGreaterThan(0);
    expect(slice.dest).toEqual(pos(20, 10));

    const codesOrigin = sumCodes(slice.dest, slice.codes);
    // The reconstructed origin is tiles[4] = (14,10): one tile AHEAD of cur.x (13).
    expect(codesOrigin).toEqual(pos(14, 10));
    expect(codesOrigin).not.toEqual(cur);
    expect(codesOrigin.x).toBeGreaterThan(cur.x); // the overshoot the forward tie-break causes

    // This is exactly the command-sender.ts:168 condition that emits 'replan'.
    expect(gateOutcome(route, cur)).toBe('replan');
  });

  it('the gate stalls forward progress on any off-line predicted, even though a forward leg is available', () => {
    // Drift south of the line: still a clean forward slice, still rejected.
    const cur = pos(13, 9);
    const slice = sliceRouteFrom(route, cur)!;
    expect(slice.codes.length).toBeGreaterThan(0); // forward progress IS possible
    expect(gateOutcome(route, cur)).toBe('replan'); // ...but the gate refuses to send it
  });
});
