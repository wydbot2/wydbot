/**
 * The FORWARD tie-break in sliceRouteFrom (route-slice.ts:20
 * `d === best && i > idx`) yields codesOrigin one tile AHEAD of src on an
 * equidistant drift; the origin-coherence gate
 * (command-sender.ts:167-170 `codesOrigin === src`) then rejects the slice.
 *
 * This file isolates the tie-break's actual contribution. The mechanical seam
 * (the gate fires when predicted is off the current route) is covered by the
 * sibling `codes-origin-gate-*` suite, which also shows the stall is BOUNDED
 * (recovers when the in-flight leg settles) and that the stale-walk breaker does
 * NOT trip (replanFrom resets the timer).
 *
 * Pinned below:
 *   (1) On the drift case the forward tie-break yields codesOrigin one tile
 *       AHEAD of src.
 *   (2) The tie-break is INCIDENTAL to the rejection: a BACKWARD tie-break
 *       (codesOrigin one tile BEHIND) is rejected by the same gate just as hard.
 *       The real cause is that codesOrigin ALWAYS reconstructs an on-route tile,
 *       so any off-route predicted is rejected regardless of tie direction.
 *   (3) For ANY on-route predicted (the steady-state case) the gate PASSES at
 *       every x — the forward tie-break produces ZERO false rejections on-line.
 *
 * => The forward tie-break does not manufacture a stall that wouldn't otherwise
 * happen.
 */
import { describe, it, expect } from 'vitest';
import { sliceRouteFrom } from '@main/session/route-slice';
import { MAX_STEP_DISTANCE } from '@shared/constants/movement';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

const pos = (x: number, y: number): MPosition => ({ x, y });

/** Faithful copy of command-sender.ts:59-67 sumCodes (module-private). */
const sumCodes = (dest: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = dest;
  for (const c of codes) {
    x -= DIR_DELTA[c].x;
    y -= DIR_DELTA[c].y;
  }
  return { x, y };
};

/** The origin-coherence gate as command-sender.ts:167-170 applies it. */
const gatePasses = (route: StreamRoute, src: MPosition): boolean => {
  const slice = sliceRouteFrom(route, src);
  if (!slice) return false; // 'replan' (no slice)
  const co = sumCodes(slice.dest, slice.codes);
  return co.x === src.x && co.y === src.y;
};

/**
 * BACKWARD tie-break variant of sliceRouteFrom — picks the LOWEST index of a
 * Chebyshev tie (strictly-less comparison) instead of the highest. Used only to
 * prove the gate rejects regardless of tie direction; it is NOT production code.
 */
const sliceBackward = (
  route: StreamRoute,
  cur: MPosition,
): { dest: MPosition; codes: DirectionCode[] } | null => {
  const { tiles, codes } = route;
  if (codes.length === 0) return null;
  let idx = 0;
  let best = Infinity;
  for (let i = 0; i < tiles.length; i++) {
    const d = Math.max(Math.abs(cur.x - tiles[i].x), Math.abs(cur.y - tiles[i].y));
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  if (idx >= codes.length) return null;
  const hardCap = Math.min(idx + MAX_STEP_DISTANCE, tiles.length - 1);
  const nextWaypoint = route.waypoints?.find((w) => w > idx);
  const end = nextWaypoint !== undefined ? Math.min(nextWaypoint, hardCap) : hardCap;
  return { dest: tiles[end], codes: codes.slice(idx, end) as DirectionCode[] };
};

// route tiles[0..10] east starting at (10,10); codes 0x36 ×10; waypoints [10].
const eastRoute: StreamRoute = {
  tiles: Array.from({ length: 11 }, (_, i) => pos(10 + i, 10)),
  codes: Array.from({ length: 10 }, () => DIR.E),
  waypoints: [10],
};

describe('slice-origin-coherence — tie-break arithmetic', () => {
  it('on-route cur (13,10): codesOrigin === cur, the gate passes', () => {
    const slice = sliceRouteFrom(eastRoute, pos(13, 10))!;
    expect(sumCodes(slice.dest, slice.codes)).toEqual(pos(13, 10));
    expect(gatePasses(eastRoute, pos(13, 10))).toBe(true);
  });

  it('drifted cur (13,11): forward tie-break bumps idx to 4, codesOrigin (14,10) overshoots src.x', () => {
    const slice = sliceRouteFrom(eastRoute, pos(13, 11))!;
    const co = sumCodes(slice.dest, slice.codes);
    expect(co).toEqual(pos(14, 10)); // codesOrigin lands one tile ahead of cur
    expect(co.x).toBeGreaterThan(13); // overshoots cur.x
    expect(gatePasses(eastRoute, pos(13, 11))).toBe(false); // gate rejects → 'replan'
  });
});

describe('slice-origin-coherence — the forward tie-break is INCIDENTAL', () => {
  it('a BACKWARD tie-break (codesOrigin BEHIND) is rejected by the same gate, just as hard', () => {
    const cur = pos(13, 11);
    const bwd = sliceBackward(eastRoute, cur)!;
    const coBwd = sumCodes(bwd.dest, bwd.codes);
    expect(coBwd).toEqual(pos(12, 10)); // one tile BEHIND, not ahead
    expect(coBwd).not.toEqual(cur); // STILL rejected — overshoot is not the cause
  });

  it('codesOrigin ALWAYS reconstructs an on-route tile, so ANY off-line predicted is rejected regardless of tie direction', () => {
    for (const cur of [pos(13, 11), pos(13, 9), pos(15, 12), pos(17, 8)]) {
      const slice = sliceRouteFrom(eastRoute, cur)!;
      const co = sumCodes(slice.dest, slice.codes);
      expect(co.y).toBe(10); // codesOrigin lands on the route line, never off it
      expect(gatePasses(eastRoute, cur)).toBe(false);
    }
  });

  it('for ANY on-route predicted (steady state), the gate PASSES at every x — the tie-break causes ZERO false rejections on-line', () => {
    for (let x = 10; x <= 20; x++) {
      const cur = pos(x, 10);
      const slice = sliceRouteFrom(eastRoute, cur);
      if (!slice) continue; // arrived at/past the final tile
      expect(gatePasses(eastRoute, cur)).toBe(true);
    }
  });
});
