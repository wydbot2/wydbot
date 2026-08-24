import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the REAL walkability-service A* over a synthetic heightmap. Walls are
 * `0x7F` tiles (as main bakes them) — the heightmap is the single walkability source.
 */

const WORLD = 4096;
const HEIGHT_BYTES = WORLD * WORLD; // flat (all 0) → every step clears ±8

const installWydAPI = (walls: ReadonlyArray<readonly [number, number]> = []): void => {
  const heightBuf = new ArrayBuffer(HEIGHT_BYTES); // zeros = flat, fully walkable
  if (walls.length > 0) {
    const h = new Int8Array(heightBuf);
    for (const [wx, wy] of walls) h[wy * WORLD + wx] = 127; // 0x7F = BLOCKED_SENTINEL (impassable)
  }
  (globalThis as unknown as { window: unknown }).window = {
    wydAPI: {
      getWalkabilityHeightmap: async () => ({
        buffer: heightBuf,
        meta: { width: WORLD, height: WORLD, hash: 'test' },
      }),
    },
  };
};

/** Fresh singleton per scenario (module-level state is otherwise sticky). */
const loadService = async (
  walls: ReadonlyArray<readonly [number, number]> = [],
): Promise<import('@renderer/lib/walkability-service').WalkabilityService> => {
  vi.resetModules();
  installWydAPI(walls);
  const mod = await import('@renderer/lib/walkability-service');
  const svc = mod.getWalkabilityService();
  await svc.ready();
  return svc;
};

/** Install a heightmap with arbitrary per-tile heights (for the ±tolerance gate). */
const loadServiceWithHeights = async (
  heights: ReadonlyArray<readonly [number, number, number]>,
): Promise<import('@renderer/lib/walkability-service').WalkabilityService> => {
  vi.resetModules();
  const heightBuf = new ArrayBuffer(HEIGHT_BYTES);
  const h = new Int8Array(heightBuf);
  for (const [x, y, v] of heights) h[y * WORLD + x] = v;
  (globalThis as unknown as { window: unknown }).window = {
    wydAPI: {
      getWalkabilityHeightmap: async () => ({
        buffer: heightBuf,
        meta: { width: WORLD, height: WORLD, hash: 'test' },
      }),
    },
  };
  const mod = await import('@renderer/lib/walkability-service');
  const svc = mod.getWalkabilityService();
  await svc.ready();
  return svc;
};

beforeEach(() => vi.resetModules());
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const assertContiguous = (tiles: ReadonlyArray<{ x: number; y: number }>): void => {
  for (let i = 1; i < tiles.length; i++) expect(cheb(tiles[i - 1], tiles[i])).toBe(1);
};

describe('walkability-service — searchRoute', () => {
  it('open field: contiguous complete route beyond the 12-tile wire chunk cap', async () => {
    const svc = await loadService();
    const { tiles, codes, status } = svc.searchRoute(100, 100, 120, 100); // cheb 20 > 12
    expect(status).toBe('complete');
    expect(tiles[0]).toEqual({ x: 100, y: 100 });
    expect(tiles[tiles.length - 1]).toEqual({ x: 120, y: 100 });
    assertContiguous(tiles);
    expect(codes.length).toBe(tiles.length - 1); // one code per hop
  });

  it('contours a wall: bends off the straight line and still reaches the goal', async () => {
    const walls: Array<[number, number]> = [];
    for (let y = 98; y <= 102; y++) walls.push([110, y]); // wall blocks y=100 at x=110
    const svc = await loadService(walls);
    const { tiles, status } = svc.searchRoute(105, 100, 115, 100);
    expect(status).toBe('complete');
    expect(tiles[tiles.length - 1]).toEqual({ x: 115, y: 100 });
    assertContiguous(tiles);
    expect(tiles.some((t) => t.y !== 100)).toBe(true); // had to leave the straight line
    for (const t of tiles) expect(walls.some(([wx, wy]) => wx === t.x && wy === t.y)).toBe(false);
  });

  it('unreachable: start boxed in on all 8 sides → empty tiles', async () => {
    const walls: Array<[number, number]> = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (dx || dy) walls.push([100 + dx, 100 + dy]);
    const svc = await loadService(walls);
    const { tiles, status } = svc.searchRoute(100, 100, 120, 100);
    expect(status).toBe('unreachable');
    expect(tiles).toEqual([]);
  });

  it('partial: a full wall with no gap → walks up to it, status partial', async () => {
    const walls: Array<[number, number]> = [];
    for (let y = 0; y < WORLD; y++) walls.push([110, y]); // entire column blocked, no gap
    const svc = await loadService(walls);
    const { tiles, status } = svc.searchRoute(100, 100, 120, 100);
    expect(status).toBe('partial');
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles[tiles.length - 1].x).toBe(109); // pressed against the wall
    assertContiguous(tiles);
  });

  it('R3: open-field diagonal is straight, never bulging above the goal row', async () => {
    const svc = await loadService();
    const { tiles, codes, status } = svc.searchRoute(100, 100, 112, 112); // pure NE diagonal
    expect(status).toBe('complete');
    assertContiguous(tiles);
    // Every tile stays exactly on the diagonal — no equal-f plateau bulge.
    for (const t of tiles) expect(t.x - 100).toBe(t.y - 100);
    expect(codes.every((c) => c === 0x39)).toBe(true); // all NE
  });
});

describe('walkability-service — stringPullRoute (greedy-reachable legs)', () => {
  it('pure: straight route → one leg per ≤12-tile span', async () => {
    const { stringPullWaypoints } = await import('@renderer/lib/walkability-service');
    const tiles = Array.from({ length: 21 }, (_, i) => ({ x: i, y: 0 })); // 0..20 straight
    const wp = stringPullWaypoints(tiles, () => true); // everything line-of-walk clear
    expect(wp).toEqual([12, 20]); // cut at the MAX_STEP_DISTANCE cap, then the end
  });

  it('pure: cuts a waypoint where line-of-walk breaks (a corner)', async () => {
    const { stringPullWaypoints } = await import('@renderer/lib/walkability-service');
    // L-shaped route: (0,0)..(5,0) then (5,1)..(5,5). Clear except across the bend.
    const tiles = [
      ...Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0 })), // idx 0..5
      ...Array.from({ length: 5 }, (_, i) => ({ x: 5, y: i + 1 })), // idx 6..10
    ];
    // isClear true only for same-row or same-col straight spans (mimics a wall at the corner).
    const isClear = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
      a.x === b.x || a.y === b.y;
    const wp = stringPullWaypoints(tiles, isClear);
    expect(wp).toEqual([5, 10]); // corner at idx 5 (5,0), then the end
  });

  it('house contour: every consecutive waypoint pair is line-of-walk reachable and ≤12', async () => {
    const walls: Array<[number, number]> = [];
    for (let y = 96; y <= 104; y++) walls.push([110, y]); // wall blocks the straight line at x=110
    const svc = await loadService(walls);
    const { tiles, status } = svc.searchRoute(105, 100, 115, 100); // must contour the wall
    expect(status).toBe('complete');
    const wp = svc.stringPullRoute(tiles);
    expect(wp.length).toBeGreaterThanOrEqual(2); // a contour needs ≥2 legs (a corner)
    expect(wp[wp.length - 1]).toBe(tiles.length - 1); // ends at the goal
    // The invariant: each leg is straight line-of-walk clear and within the wire cap.
    let start = 0;
    for (const w of wp) {
      expect(svc.hasLineOfWalk(tiles[start].x, tiles[start].y, tiles[w].x, tiles[w].y)).toBe(true);
      expect(cheb(tiles[start], tiles[w])).toBeLessThanOrEqual(12);
      start = w;
    }
  });
});

describe('walkability-service — canStep height tolerance (strict <8 ⇒ |Δh| ≤ 7)', () => {
  it('rejects a |Δh|==8 step and admits |Δh|==7', async () => {
    const svc = await loadServiceWithHeights([
      [101, 100, 8], // Δ=8 from the (100,100)=0 origin → must be REJECTED (strict <)
      [103, 100, 7], // Δ=7 → still admitted
    ]);
    expect(svc.canStep(100, 100, 101, 100)).toBe(false);
    expect(svc.canStep(100, 100, 103, 100)).toBe(true);
  });
});

describe('walkability-service — reachableWithin (bounded probe)', () => {
  it('complete when the target is within the route-step budget', async () => {
    const svc = await loadService();
    const r = svc.reachableWithin(100, 100, 110, 100, 24);
    expect(r.status).toBe('complete');
    expect(r.frontier).toEqual({ x: 110, y: 100 });
  });

  it('partial when the target is beyond the step budget (returns a frontier)', async () => {
    const svc = await loadService();
    const r = svc.reachableWithin(100, 100, 100, 140, 10); // 40 tiles away, cap 10
    expect(r.status).toBe('partial');
    expect(r.frontier).not.toBeNull();
  });

  it('unreachable + null frontier when boxed in', async () => {
    const walls: Array<[number, number]> = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (dx || dy) walls.push([100 + dx, 100 + dy]);
    const svc = await loadService(walls);
    const r = svc.reachableWithin(100, 100, 110, 100, 24);
    expect(r.status).toBe('unreachable');
    expect(r.frontier).toBeNull();
  });

  it('complete for a contour-reachable target a straight-line gate would reject', async () => {
    const walls: Array<[number, number]> = [];
    for (let y = 96; y <= 104; y++) walls.push([110, y]); // wall blocks the straight line at x=110
    const svc = await loadService(walls);
    const r = svc.reachableWithin(105, 100, 115, 100, 24); // must detour around, still within budget
    expect(r.status).toBe('complete');
  });
});

describe('walkability-pickers — pickReachableTileAround', () => {
  it('returns a target-adjacent tile that is route-reachable from the player', async () => {
    await loadService();
    const { pickReachableTileAround } = await import('@renderer/lib/walkability-pickers');
    const t = pickReachableTileAround({ x: 120, y: 120 }, 1, { x: 112, y: 120 });
    expect(t).not.toBeNull();
    expect(Math.max(Math.abs(t!.x - 120), Math.abs(t!.y - 120))).toBe(1); // adjacent to center
  });

  it('never returns an unreachable adjacent tile (sealed center → nearest approach frontier)', async () => {
    // A closed wall ring (radius-2 box perimeter) seals the center's adjacency.
    // The ring-1 tiles are canStep-adjacent to the center but unreachable from an
    // outside player — the old canStep-only picker would have returned one. The
    // reachability-ranked picker instead settles for the nearest reachable approach.
    const walls: Array<[number, number]> = [];
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) walls.push([120 + dx, 120 + dy]);
    const svc = await loadService(walls);
    const { pickReachableTileAround } = await import('@renderer/lib/walkability-pickers');
    const t = pickReachableTileAround({ x: 120, y: 120 }, 1, { x: 110, y: 120 });
    expect(t).not.toBeNull();
    expect(svc.reachableWithin(110, 120, t!.x, t!.y, 24).status).toBe('complete'); // reachable
    expect(Math.max(Math.abs(t!.x - 120), Math.abs(t!.y - 120))).toBeGreaterThan(1); // not a sealed ring-1 tile
  });
});
