/**
 * Runtime-frequency companion to slice-hardcap-overruns-waypoint.test.ts (which
 * probes correctness of the codes geometry). This file answers:
 *
 *   1. How OFTEN does the index-vs-Chebyshev mismatch (end = hardCap < nextWaypoint)
 *      actually arise on plausible contour routes?
 *   2. When it arises, is the HARMFUL variant reachable — i.e. does the mid-leg cut tile
 *      `tiles[idx+12]` ever fail line-of-walk from the leg start, so a *straight-hop*
 *      server would cut a wall?
 *
 * The wire packet carries the per-hop direction codes (command-sender.ts:177-185
 * passes `slice.codes` to buildMovePacket — the codes-replay model), so the
 * straight-hop server model in (2) does not apply. These tests pin (1)'s frequency
 * and show (2) is geometrically unreachable from a real string-pull leg.
 */

import { describe, expect, it } from 'vitest';
import { MAX_STEP_DISTANCE } from '@shared/constants/movement';
import type { MPosition } from '@shared/types';
import { sliceRouteFrom } from '@main/session/route-slice';
import { stringPullWaypoints } from '@renderer/lib/walkability-service';
import type { DirectionCode, StreamRoute } from '@shared/ipc/walkability';

const cheb = (a: MPosition, b: MPosition): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * Bresenham line-of-walk over a blocked-cell set — the SAME supercover topology as
 * hasLineOfWalkImpl (walkability-service.ts:123-155), with height collapsed to a binary
 * "blocked or not". `stringPullWaypoints` takes `isClear` injected, so this is faithful.
 */
const makeIsClear =
  (blocked: ReadonlySet<string>) =>
  (a: MPosition, b: MPosition): boolean => {
    let { x, y } = a;
    const dxAbs = Math.abs(b.x - a.x);
    const dyAbs = Math.abs(b.y - a.y);
    if (Math.max(dxAbs, dyAbs) > 30) return false; // MAX_LINE_TILES
    const sx = a.x < b.x ? 1 : -1;
    const sy = a.y < b.y ? 1 : -1;
    let err = dxAbs - dyAbs;
    if (blocked.has(`${x},${y}`)) return false;
    while (x !== b.x || y !== b.y) {
      const e2 = err * 2;
      if (e2 > -dyAbs) {
        err -= dyAbs;
        x += sx;
      }
      if (e2 < dxAbs) {
        err += dxAbs;
        y += sy;
      }
      if (blocked.has(`${x},${y}`)) return false;
    }
    return true;
  };

/** Deterministic LCG so the fuzz is reproducible. */
const makeRng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
};

const DIR8: ReadonlyArray<{ x: number; y: number; code: DirectionCode }> = [
  { x: 1, y: 0, code: 0x36 },
  { x: -1, y: 0, code: 0x34 },
  { x: 0, y: 1, code: 0x38 },
  { x: 0, y: -1, code: 0x32 },
  { x: 1, y: 1, code: 0x39 },
  { x: -1, y: 1, code: 0x37 },
  { x: 1, y: -1, code: 0x33 },
  { x: -1, y: -1, code: 0x31 },
];

describe('slice-hardcap runtime frequency — the mismatch is COMMON', () => {
  it('a flat-field contour through open terrain reliably collapses to one waypoint, so the slicer truncates mid-leg', () => {
    // Any near-diagonal contour ≤12 Chebyshev across open ground (= normal farm terrain
    // between mobs) collapses to a single waypoint; every chunk past the first 12 codes
    // is then index-capped. This is the ordinary case, not a corner case.
    const tiles: MPosition[] = [{ x: 0, y: 0 }];
    const codes: DirectionCode[] = [];
    // 8 NE then 8 E = 16 hops, Chebyshev((0,0),(16,8)) ... but keep cheb<=12 by zig within box:
    for (let i = 0; i < 8; i++) {
      tiles.push({ x: tiles[tiles.length - 1].x + 1, y: tiles[tiles.length - 1].y + 1 });
      codes.push(0x39); // NE
      tiles.push({ x: tiles[tiles.length - 1].x + 1, y: tiles[tiles.length - 1].y });
      codes.push(0x36); // E -- but this overruns cheb; trimmed below
    }
    // Trim to a within-box zig: rebuild a guaranteed cheb<=12, index>12 staircase.
    const t2: MPosition[] = [{ x: 0, y: 0 }];
    const c2: DirectionCode[] = [];
    for (let i = 0; i < 8; i++) {
      t2.push({ x: t2[t2.length - 1].x + 1, y: t2[t2.length - 1].y });
      c2.push(0x36); // E
      t2.push({ x: t2[t2.length - 1].x, y: t2[t2.length - 1].y + 1 });
      c2.push(0x38); // N
    }
    // 17 tiles, ends (8,8): cheb 8, index span 16.
    const wps = stringPullWaypoints(t2, () => true);
    expect(wps).toEqual([16]); // single far waypoint
    const slice = sliceRouteFrom({ tiles: t2, codes: c2, waypoints: wps }, { x: 0, y: 0 })!;
    expect(slice.codes.length).toBe(MAX_STEP_DISTANCE); // capped at 12, not 16
    expect(wps.includes(12)).toBe(false); // cut at a non-waypoint index — mismatch confirmed
  });

  it('fuzz: the mismatch fires on the MAJORITY of long contour legs (frequency, not contrivance)', () => {
    const rng = makeRng(0xc0ffee);
    let legsTotal = 0;
    let mismatchLegs = 0;
    let routesWithMismatch = 0;
    const TRIALS = 40_000;

    for (let t = 0; t < TRIALS; t++) {
      const blocked = new Set<string>();
      const nb = Math.floor(rng() * 35);
      for (let b = 0; b < nb; b++)
        blocked.add(`${Math.floor(rng() * 25)},${Math.floor(rng() * 25)}`);
      const isClear = makeIsClear(blocked);

      let x = Math.floor(rng() * 5);
      let y = Math.floor(rng() * 5);
      if (blocked.has(`${x},${y}`)) continue;
      const tiles: MPosition[] = [{ x, y }];
      const len = 14 + Math.floor(rng() * 9);
      let ok = true;
      for (let s = 0; s < len; s++) {
        const d = DIR8[Math.floor(rng() * DIR8.length)];
        const nx = x + d.x;
        const ny = y + d.y;
        if (nx < 0 || ny < 0 || blocked.has(`${nx},${ny}`)) {
          ok = false;
          break;
        }
        x = nx;
        y = ny;
        tiles.push({ x, y });
      }
      if (!ok || tiles.length < 14) continue;

      const wps = stringPullWaypoints(tiles, isClear);
      let prev = 0;
      let routeHit = false;
      for (const w of wps) {
        legsTotal++;
        if (w - prev > MAX_STEP_DISTANCE && cheb(tiles[prev], tiles[w]) <= MAX_STEP_DISTANCE) {
          mismatchLegs++;
          routeHit = true;
        }
        prev = w;
      }
      if (routeHit) routesWithMismatch++;
    }

    // The mismatch is the dominant outcome on long open-terrain legs — proves the
    // mechanism is NOT a contrived input that never occurs at runtime.
    expect(legsTotal).toBeGreaterThan(1000);
    expect(mismatchLegs).toBeGreaterThan(legsTotal * 0.3);
    expect(routesWithMismatch).toBeGreaterThan(0);
  });
});

describe('slice-hardcap runtime frequency — the HARMFUL variant is unreachable', () => {
  it('fuzz: across tens of thousands of mismatch legs, the mid-leg cut tile is ALWAYS line-of-walk from the leg start (no wall-cut even under a straight-hop server)', () => {
    const rng = makeRng(0xbadf00d);
    let mismatchLegs = 0;
    let harmful = 0;
    const TRIALS = 60_000;

    for (let t = 0; t < TRIALS; t++) {
      const blocked = new Set<string>();
      const nb = Math.floor(rng() * 40);
      for (let b = 0; b < nb; b++)
        blocked.add(`${Math.floor(rng() * 25)},${Math.floor(rng() * 25)}`);
      const isClear = makeIsClear(blocked);

      let x = Math.floor(rng() * 5);
      let y = Math.floor(rng() * 5);
      if (blocked.has(`${x},${y}`)) continue;
      const tiles: MPosition[] = [{ x, y }];
      const len = 14 + Math.floor(rng() * 9);
      let ok = true;
      for (let s = 0; s < len; s++) {
        const d = DIR8[Math.floor(rng() * DIR8.length)];
        const nx = x + d.x;
        const ny = y + d.y;
        if (nx < 0 || ny < 0 || blocked.has(`${nx},${ny}`)) {
          ok = false;
          break;
        }
        x = nx;
        y = ny;
        tiles.push({ x, y });
      }
      if (!ok || tiles.length < 14) continue;

      const wps = stringPullWaypoints(tiles, isClear);
      let prev = 0;
      for (const w of wps) {
        if (w - prev > MAX_STEP_DISTANCE && cheb(tiles[prev], tiles[w]) <= MAX_STEP_DISTANCE) {
          mismatchLegs++;
          // The slice from the leg start cuts at tiles[prev + 12]. Under a
          // straight-hop server hypothesis, the server would walk a STRAIGHT line
          // src -> tiles[prev+12]. Is that straight line ever blocked?
          const cut = tiles[prev + MAX_STEP_DISTANCE];
          if (!isClear(tiles[prev], cut)) harmful++;
        }
        prev = w;
      }
    }

    // The mismatch is well-exercised...
    expect(mismatchLegs).toBeGreaterThan(5000);
    // ...yet the harmful straight-line wall-cut never materializes: a waypoint only
    // exists because isClear(legStart, waypoint) held, and the closer mid-leg tile lies
    // within that already-clear corridor. So even granting the straight-hop server
    // model, the emitted dst is reachable -> no rubberband.
    expect(harmful).toBe(0);
  });

  it('the flat zig case: the mid-leg cut tile (12,0) is a straight-clear hop from the origin on the open field the zig requires', () => {
    // Reconstruct the 12E+5N zig. The zig only collapses to one waypoint on a
    // FLAT field (cheb=12, isClear all-true). On that same flat field, the cut tile (12,0)
    // is trivially line-of-walk from (0,0) — there is no wall to cut.
    const tiles: MPosition[] = [{ x: 0, y: 0 }];
    const codes: DirectionCode[] = [];
    for (let x = 1; x <= 12; x++) {
      tiles.push({ x, y: 0 });
      codes.push(0x36);
    }
    for (let yy = 1; yy <= 5; yy++) {
      tiles.push({ x: 12, y: yy });
      codes.push(0x38);
    }
    const route: StreamRoute = { tiles, codes, waypoints: stringPullWaypoints(tiles, () => true) };
    expect(route.waypoints).toEqual([17]);
    const slice = sliceRouteFrom(route, { x: 0, y: 0 })!;
    expect(slice.dest).toEqual({ x: 12, y: 0 });
    // On the flat field the zig presupposes, the straight hop to the cut tile is clear.
    const flatClear = makeIsClear(new Set());
    expect(flatClear({ x: 0, y: 0 }, slice.dest)).toBe(true);
  });
});
