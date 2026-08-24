import { afterEach, describe, expect, it, vi } from 'vitest';
import { MovementState } from '@main/session/movement-state';
import { sliceRouteFrom } from '@main/session/route-slice';
import { DIR, DIR_DELTA, type DirectionCode } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

// speed 6 → perTile = round(1000/6) = 167ms; a 12-step leg travels 12×167 = 2004ms.
const PER_TILE_6 = 167;
const STEPS = 12;
const TRAVEL = STEPS * PER_TILE_6;

describe('MovementState — outbound origin is the dead-reckoned predicted position', () => {
  afterEach(() => vi.restoreAllMocks());

  it('interpolates the current tile mid-leg (start at k=0, dst once travel elapsed)', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 0, y: 0 });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    ms.commitMove({ x: STEPS, y: 0 }, STEPS, 6);

    expect(ms.getPredictedPosition(1000)).toEqual({ x: 0, y: 0 }); // leg start = where we were
    expect(ms.getPredictedPosition(1000 + TRAVEL)).toEqual({ x: STEPS, y: 0 }); // settled at dst
    const mid = ms.getPredictedPosition(1000 + TRAVEL / 2);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(STEPS);
  });

  it('chaining a move mid-leg sources the new leg from the LIVE tile, not the optimistic dst', () => {
    // This is the rubberband-storm guard: if the next 0x36C sourced its src from
    // the optimistic leg-end (the previous dst) while the avatar is only mid-leg, the
    // wire origin would jump ahead of the server's real position → rubberband storm.
    const ms = new MovementState();
    ms.setCharToWorld({ x: 0, y: 0 });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    ms.commitMove({ x: STEPS, y: 0 }, STEPS, 6); // leg (0,0)→(12,0)

    vi.spyOn(Date, 'now').mockReturnValue(1000 + TRAVEL / 2); // halfway
    const live = ms.getPredictedPosition(1000 + TRAVEL / 2); // ~ (6,0)
    expect(live).toEqual({ x: STEPS / 2, y: 0 });

    ms.commitMove({ x: 6, y: STEPS }, STEPS, 6); // chain a new move while mid-leg
    // the new leg starts from the live tile, NOT from the previous dst (12,0)
    expect(ms.getPredictedPosition(1000 + TRAVEL / 2)).toEqual(live);
    expect(ms.getPredictedPosition(1000 + TRAVEL / 2)).not.toEqual({ x: STEPS, y: 0 });
  });

  it('a server correction hard-anchors the predicted position regardless of the clock', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 0, y: 0 });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    ms.commitMove({ x: STEPS, y: 0 }, STEPS, 6);

    ms.applyRubberband({ x: 3, y: 3 });
    expect(ms.getPredictedPosition(1000)).toEqual({ x: 3, y: 3 });
    expect(ms.getPredictedPosition(99999)).toEqual({ x: 3, y: 3 });
    expect(ms.isInterpolating(99999)).toBe(false);
  });

  it('isLegInFlight dedups an identical re-slice only while the same leg is interpolating', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 0, y: 0 });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const codes = [DIR.NE, DIR.NE] as const; // leg from (0,0), src = predicted@commit = (0,0)
    ms.commitMove({ x: 2, y: 2 }, 2, 6, codes);

    // Same src + same codes, still in-flight → dedup (skip the redundant send).
    expect(ms.isLegInFlight({ x: 0, y: 0 }, codes, 1000)).toBe(true);
    // Different codes (route changed) → not a dup, must send.
    expect(ms.isLegInFlight({ x: 0, y: 0 }, [DIR.E, DIR.E], 1000)).toBe(false);
    // Leg finished (travel elapsed: 2 × 167ms) → re-send allowed.
    expect(ms.isLegInFlight({ x: 0, y: 0 }, codes, 1000 + 2 * PER_TILE_6 + 1)).toBe(false);
    // A correction nulls the leg → not in flight.
    ms.applyRubberband({ x: 5, y: 5 });
    expect(ms.isLegInFlight({ x: 5, y: 5 }, codes, 1000)).toBe(false);
  });
});

// ── Route storage + the single-origin invariant the mover relies on ──────────
const neTiles = (n: number): MPosition[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: i, y: i }));
const neCodes = (n: number): DirectionCode[] => Array.from({ length: n }, () => DIR.NE);

/** Origin a chunk's codes start from (mirrors command-sender's private `sumCodes`). */
const codesOrigin = (dest: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = dest;
  for (const c of codes) {
    x -= DIR_DELTA[c].x;
    y -= DIR_DELTA[c].y;
  }
  return { x, y };
};

describe('MovementState — route storage and single-origin mover invariant', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stores and returns a route by source; a server correction drops it', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 0, y: 0 });
    ms.setRoute('walk', neTiles(8), neCodes(8));
    expect(ms.getRoute('walk')?.tiles.length).toBe(9);

    ms.applyRubberband({ x: 50, y: 50 }); // epoch bump + route drop
    expect(ms.getRoute('walk')).toBeNull(); // stale route is not served
  });

  it('src == codes-origin on every streamed chunk (the bug this refactor fixes)', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 0, y: 0 });
    ms.setRoute('walk', neTiles(30), neCodes(30));

    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const finalDst = { x: 30, y: 30 };

    // Simulate the executor loop: src = predicted; slice from it; commit; advance time.
    for (let guard = 0; guard < 10; guard++) {
      const src = ms.getPredictedPosition(now);
      if (Math.max(Math.abs(src.x - finalDst.x), Math.abs(src.y - finalDst.y)) <= 1) break;
      const route = ms.getRoute('walk');
      expect(route).not.toBeNull();
      const slice = sliceRouteFrom(route!, src);
      expect(slice).not.toBeNull();

      // THE INVARIANT: the chunk's codes start exactly at the tile we stamp as src.
      expect(codesOrigin(slice!.dest, slice!.codes)).toEqual(src);

      ms.commitMove(slice!.dest, slice!.codes.length, 6, slice!.codes);
      now += slice!.codes.length * PER_TILE_6; // predicted settles on slice.dest (a route tile)
    }

    // Reached the end on the route.
    expect(ms.getPredictedPosition(now)).toEqual({ x: 30, y: 30 });
  });
});
