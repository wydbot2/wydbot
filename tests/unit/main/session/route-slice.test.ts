import { describe, expect, it } from 'vitest';
import { MAX_STEP_DISTANCE } from '@shared/constants/movement';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';
import { sliceRouteFrom } from '@main/session/route-slice';

const pos = (x: number, y: number): MPosition => ({ x, y });
const eastTiles = (x0: number, y: number, n: number): MPosition[] =>
  Array.from({ length: n + 1 }, (_, i) => pos(x0 + i, y));
const eastCodes = (n: number): DirectionCode[] => Array.from({ length: n }, () => DIR.E);

const neTiles = (x0: number, y0: number, n: number): MPosition[] =>
  Array.from({ length: n + 1 }, (_, i) => pos(x0 + i, y0 + i));
const neCodes = (n: number): DirectionCode[] => Array.from({ length: n }, () => DIR.NE);

/** Walk `codes` from `start`, returning the endpoint — the geometry the server replays. */
const walk = (start: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = start;
  for (const c of codes) {
    x += DIR_DELTA[c].x;
    y += DIR_DELTA[c].y;
  }
  return { x, y };
};

describe('sliceRouteFrom (continuous mover — re-slice from the live position)', () => {
  const route20 = { tiles: eastTiles(0, 0, 20), codes: eastCodes(20) };

  it('caps the chunk at MAX_STEP_DISTANCE codes from the start of a long route', () => {
    const slice = sliceRouteFrom(route20, pos(0, 0));
    expect(slice).not.toBeNull();
    expect(slice!.codes.length).toBe(MAX_STEP_DISTANCE);
    expect(slice!.dest).toEqual(pos(MAX_STEP_DISTANCE, 0));
  });

  it('re-slices from the nearest tile to the live position (mid-route)', () => {
    const slice = sliceRouteFrom(route20, pos(5, 0));
    expect(slice!.codes.length).toBe(MAX_STEP_DISTANCE);
    expect(slice!.dest).toEqual(pos(5 + MAX_STEP_DISTANCE, 0)); // (17,0)
  });

  it('the chunk codes exactly walk the nearest tile to the returned dest (no overshoot)', () => {
    const slice = sliceRouteFrom(route20, pos(5, 0))!;
    // east route: each code is +1 x, so dest.x − nearestTile.x must equal codes.length
    expect(slice.dest.x - 5).toBe(slice.codes.length);
  });

  it('returns the remaining (<12) codes near the end', () => {
    const route8 = { tiles: eastTiles(0, 0, 8), codes: eastCodes(8) };
    const slice = sliceRouteFrom(route8, pos(0, 0))!;
    expect(slice.codes.length).toBe(8);
    expect(slice.dest).toEqual(pos(8, 0));
  });

  it('returns null once the live position has reached the route end (arrived)', () => {
    expect(sliceRouteFrom(route20, pos(20, 0))).toBeNull();
  });

  it('returns null for a degenerate (no-code) route', () => {
    expect(sliceRouteFrom({ tiles: [pos(3, 3)], codes: [] }, pos(3, 3))).toBeNull();
  });

  // ── Coherence invariant: the codes always walk the nearest route tile → dest ──
  it('codes walk the nearest route tile exactly to the returned dest (coherence)', () => {
    // cur off the diagonal corridor; nearest tile is whatever sliceRouteFrom picked.
    const route = { tiles: neTiles(0, 0, 20), codes: neCodes(20) } satisfies StreamRoute;
    for (const cur of [pos(3, 2), pos(2, 3), pos(7, 7), pos(0, 0), pos(11, 13)]) {
      const slice = sliceRouteFrom(route, cur);
      if (!slice) continue;
      // The chunk's origin is the route tile `codes.length` steps before `dest`.
      const destIdx = route.tiles.findIndex((t) => t.x === slice.dest.x && t.y === slice.dest.y);
      const startTile = route.tiles[destIdx - slice.codes.length];
      expect(walk(startTile, slice.codes)).toEqual(slice.dest);
    }
  });

  // ── R2: diagonal tie-break must pick the FORWARD tile, never re-walk backward ──
  it('R2: on a diagonal route, an off-line cur picks the forward tile (no backward first code)', () => {
    const route = { tiles: neTiles(0, 0, 20), codes: neCodes(20) } satisfies StreamRoute;
    // cur=(3,2): Chebyshev-equidistant (d=1) to (2,2)[behind] and (3,3)[forward].
    const slice = sliceRouteFrom(route, pos(3, 2))!;
    // Forward pick ⇒ first code is still NE, never SW (0x31) / NW (0x37) backward.
    expect(slice.codes[0]).toBe(DIR.NE);
    // And the codes walk forward from (3,3), not from (2,2).
    expect(walk(pos(3, 3), slice.codes)).toEqual(slice.dest);
  });

  // ── Greedy-reachable legs: chunk dst clamps to the next waypoint ──
  it('clamps the chunk dst to the next waypoint (greedy-reachable leg), not the 12-cap', () => {
    const route = {
      tiles: eastTiles(0, 0, 20),
      codes: eastCodes(20),
      waypoints: [8, 20], // leg boundary at idx 8 (before the 12 hard cap)
    } satisfies StreamRoute;
    const slice = sliceRouteFrom(route, pos(0, 0))!;
    expect(slice.dest).toEqual(pos(8, 0)); // stopped at the waypoint, not (12,0)
    expect(slice.codes.length).toBe(8);
    expect(walk(pos(0, 0), slice.codes)).toEqual(slice.dest); // coherence preserved
  });

  it('past a waypoint, slices to the following waypoint', () => {
    const route = {
      tiles: eastTiles(0, 0, 20),
      codes: eastCodes(20),
      waypoints: [8, 20],
    } satisfies StreamRoute;
    const slice = sliceRouteFrom(route, pos(8, 0))!; // at the first waypoint
    expect(slice.dest).toEqual(pos(20, 0)); // next waypoint is the end; 12-cap also lands at 20
    expect(walk(pos(8, 0), slice.codes)).toEqual(slice.dest);
  });

  it('without waypoints, falls back to the blind 12-cap (legacy)', () => {
    const slice = sliceRouteFrom(route20, pos(0, 0))!;
    expect(slice.dest).toEqual(pos(MAX_STEP_DISTANCE, 0));
  });
});
