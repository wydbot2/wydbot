/**
 * sliceRouteFrom hard-caps a chunk at 12 *index* units while
 * stringPullWaypoints collapses legs by *Chebyshev* displacement, so a waypoint
 * can be >12 indices ahead; when hardCap wins, the chunk dst lands at tiles[idx+12]
 * — a non-waypoint interior tile never line-of-walk-validated, so a straight-hop
 * server would walk a different/blocked hop -> rubberband.
 *
 * These tests (a) pin the numeric mechanics exactly, then
 * (b) test the CORRECTNESS desync mechanism: does the emitted chunk actually
 * deviate from the contour the planner validated?
 */

import { describe, expect, it } from 'vitest';
import { MAX_STEP_DISTANCE } from '@shared/constants/movement';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';
import { sliceRouteFrom } from '@main/session/route-slice';
import { stringPullWaypoints } from '@renderer/lib/walkability-service';

const pos = (x: number, y: number): MPosition => ({ x, y });

/** Walk `codes` from `start`, returning the endpoint — the geometry the server replays. */
const walk = (start: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = start;
  for (const c of codes) {
    x += DIR_DELTA[c].x;
    y += DIR_DELTA[c].y;
  }
  return { x, y };
};

// The zig case: 12 east hops (0,0)..(12,0) then 5 north hops (12,1)..(12,5).
// 18 tiles, 17 codes. cheb((0,0),(12,5)) = max(12,5) = 12 <= MAX_STEP_DISTANCE.
// IMPORTANT: codes MUST satisfy the StreamRoute invariant tiles[i+1] = tiles[i] + DIR_DELTA[codes[i]]
// (walkability.ts:36) — the planner only ever emits self-consistent tiles+codes.
const buildZig = (): StreamRoute => {
  const tiles: MPosition[] = [pos(0, 0)];
  const codes: DirectionCode[] = [];
  for (let x = 1; x <= 12; x++) {
    tiles.push(pos(x, 0));
    codes.push(DIR.E); // 12 east codes
  }
  for (let y = 1; y <= 5; y++) {
    tiles.push(pos(12, y));
    codes.push(DIR.N); // 5 north codes
  }
  return { tiles, codes }; // 18 tiles, 17 codes
};

describe('slice-hardcap-overruns-waypoint — mechanics', () => {
  it('a flat-field zig string-pulls to a single far waypoint at index 17', () => {
    const { tiles } = buildZig();
    expect(tiles).toHaveLength(18);
    // Flat field: isClear always true -> the whole route collapses into one leg.
    const wps = stringPullWaypoints(tiles, () => true);
    expect(wps).toEqual([17]);
  });

  it('the slicer DOES truncate the chunk at index 12, not the waypoint at 17 (mechanic confirmed)', () => {
    const route: StreamRoute = { ...buildZig(), waypoints: [17] };
    const slice = sliceRouteFrom(route, pos(0, 0))!;
    expect(slice.dest).toEqual(pos(12, 0)); // ends at tiles[12], not the waypoint tiles[17]
    expect(slice.codes.length).toBe(MAX_STEP_DISTANCE); // 12 codes
    expect(route.waypoints!.includes(12)).toBe(false); // the index-12 cut is not a waypoint
  });
});

describe('slice-hardcap-overruns-waypoint — CORRECTNESS of the desync mechanism', () => {
  it('the emitted codes faithfully walk the nearest route tile -> dst (codes ARE the contour, not a straight hop)', () => {
    const route: StreamRoute = { ...buildZig(), waypoints: [17] };
    const slice = sliceRouteFrom(route, pos(0, 0))!;
    // The wire packet carries slice.codes (buildMovePacket -> writeDirectionCodes).
    // The server replays these per-hop codes, NOT a straight src->dst line.
    // So the emitted geometry is exactly the prefix of the planner's contour.
    expect(walk(pos(0, 0), slice.codes)).toEqual(slice.dest);
  });

  it('the chunk codes are a verbatim prefix of the route codes (no fabricated/un-validated hop)', () => {
    const route = buildZig();
    const withWp: StreamRoute = { ...route, waypoints: [17] };
    const slice = sliceRouteFrom(withWp, pos(0, 0))!;
    // codes.slice(idx,end) with idx=0,end=12 -> the first 12 route codes verbatim.
    expect(slice.codes).toEqual(route.codes.slice(0, 12));
  });

  it('a TRUE contour (zig around a wall) still emits codes that hug the contour, never a wall-cutting straight line', () => {
    // Contour that genuinely zigzags: NE up to (6,6), then the planner had to swing
    // out. Index span (12 codes) but Chebyshev displacement < 12 because of the zig.
    // We assert the slice codes reproduce the EXACT planned tiles, so whatever the
    // planner avoided, the chunk avoids too — the dst is reached by the contour codes.
    const tiles: MPosition[] = [pos(0, 0)];
    const codes: DirectionCode[] = [];
    const push = (c: DirectionCode): void => {
      codes.push(c);
      tiles.push(walk(tiles[tiles.length - 1], [c]));
    };
    // zig: E,N,E,N,... 14 hops -> Chebyshev((0,0),(7,7)) = 7 but 14 indices
    for (let i = 0; i < 7; i++) {
      push(DIR.E);
      push(DIR.N);
    }
    const route: StreamRoute = { tiles, codes };
    const slice = sliceRouteFrom(route, pos(0, 0))!;
    // 12-code cap -> ends at tiles[12], reached by the first 12 contour codes verbatim.
    expect(slice.codes).toEqual(codes.slice(0, 12));
    expect(walk(pos(0, 0), slice.codes)).toEqual(slice.dest);
    // The dst tile is on the planned contour (a tile the planner emitted), NOT an
    // off-contour straight-line endpoint.
    expect(tiles).toContainEqual(slice.dest);
  });
});
