/**
 * searchRoute `opts.avoid` — dynamically-blocked tiles (the walk-recovery
 * blacklist of server-disputed tiles) are treated as unwalkable by the A*.
 * Exercises the REAL walkability-service over a synthetic flat heightmap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tileKey } from '@renderer/lib/walk-recovery';

const WORLD = 4096;
const HEIGHT_BYTES = WORLD * WORLD; // flat (all 0) → every step clears ±8

const installWydAPI = (): void => {
  (globalThis as unknown as { window: unknown }).window = {
    wydAPI: {
      getWalkabilityHeightmap: async () => ({
        buffer: new ArrayBuffer(HEIGHT_BYTES),
        meta: { width: WORLD, height: WORLD, hash: 'test' },
      }),
    },
  };
};

const loadService = async (): Promise<
  import('@renderer/lib/walkability-service').WalkabilityService
> => {
  vi.resetModules();
  installWydAPI();
  const mod = await import('@renderer/lib/walkability-service');
  const svc = mod.getWalkabilityService();
  await svc.ready();
  return svc;
};

beforeEach(() => vi.resetModules());
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

const avoid = (...tiles: ReadonlyArray<readonly [number, number]>): ReadonlySet<number> =>
  new Set(tiles.map(([x, y]) => tileKey({ x, y })));

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('searchRoute — avoid set', () => {
  it('detours around an avoided tile on the straight corridor', async () => {
    const svc = await loadService();
    const r = svc.searchRoute(100, 100, 106, 100, { avoid: avoid([103, 100]) });
    expect(r.status).toBe('complete');
    expect(r.tiles[r.tiles.length - 1]).toEqual({ x: 106, y: 100 });
    expect(r.tiles.some((t) => t.x === 103 && t.y === 100)).toBe(false);
    expect(r.tiles.some((t) => t.y !== 100)).toBe(true); // had to leave the straight line
    for (let i = 1; i < r.tiles.length; i++) expect(cheb(r.tiles[i - 1], r.tiles[i])).toBe(1);
  });

  it('keys outside the search corridor are harmless', async () => {
    const svc = await loadService();
    const baseline = svc.searchRoute(100, 100, 106, 100);
    const r = svc.searchRoute(100, 100, 106, 100, { avoid: avoid([500, 500], [0, 0]) });
    expect(r.status).toBe('complete');
    expect(r.tiles).toEqual(baseline.tiles); // identical route: far keys change nothing
  });

  it('boxed-in start (all 8 neighbours avoided) → unreachable', async () => {
    const svc = await loadService();
    const ring: Array<readonly [number, number]> = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (dx || dy) ring.push([100 + dx, 100 + dy] as const);
    const r = svc.searchRoute(100, 100, 106, 100, { avoid: avoid(...ring) });
    expect(r.status).toBe('unreachable');
    expect(r.tiles).toEqual([]);
  });

  it('avoided goal tile → goal is always enterable (avoid gates transit only)', async () => {
    const svc = await loadService();
    const r = svc.searchRoute(100, 100, 105, 100, { avoid: avoid([105, 100]) });
    expect(r.status).toBe('complete');
    expect(r.tiles[r.tiles.length - 1]).toEqual({ x: 105, y: 100 });
  });

  it('corner-cut honors avoid: no diagonal slip between two avoided flanks', async () => {
    const svc = await loadService();
    // Direct NE diagonal (100,100)→(101,101)→(102,102) has flanks (101,100)/(100,101).
    const r = svc.searchRoute(100, 100, 102, 102, { avoid: avoid([101, 100], [100, 101]) });
    expect(r.status).toBe('complete');
    expect(r.tiles.some((t) => t.x === 101 && t.y === 100)).toBe(false);
    expect(r.tiles.some((t) => t.x === 100 && t.y === 101)).toBe(false);
    // The (100,100)→(101,101) diagonal must NOT be the route's first step.
    expect(r.tiles[1]).not.toEqual({ x: 101, y: 101 });
    expect(r.tiles.length).toBeGreaterThan(3); // longer than the direct 3-tile diagonal
  });

  it('no avoid set → unchanged behaviour (regression guard)', async () => {
    const svc = await loadService();
    const r = svc.searchRoute(100, 100, 106, 100);
    expect(r.status).toBe('complete');
    expect(r.tiles[0]).toEqual({ x: 100, y: 100 });
    expect(r.tiles[r.tiles.length - 1]).toEqual({ x: 106, y: 100 });
    for (let i = 1; i < r.tiles.length; i++) expect(cheb(r.tiles[i - 1], r.tiles[i])).toBe(1);
  });

  it('a single avoided tile seals a 1-wide corridor (why the blacklist TTL must stay short)', async () => {
    // Walls (0x7F sentinel) at y=99 and y=101 across the whole map: y=100 is the only path.
    const bytes = new Uint8Array(HEIGHT_BYTES);
    for (let x = 0; x < WORLD; x++) {
      bytes[99 * WORLD + x] = 0x7f;
      bytes[101 * WORLD + x] = 0x7f;
    }
    vi.resetModules();
    (globalThis as unknown as { window: unknown }).window = {
      wydAPI: {
        getWalkabilityHeightmap: async () => ({
          buffer: bytes.buffer,
          meta: { width: WORLD, height: WORLD, hash: 'test' },
        }),
      },
    };
    const mod = await import('@renderer/lib/walkability-service');
    const svc = mod.getWalkabilityService();
    await svc.ready();

    const open = svc.searchRoute(100, 100, 106, 100);
    expect(open.status).toBe('complete'); // corridor is walkable without the blacklist

    const sealed = svc.searchRoute(100, 100, 106, 100, { avoid: avoid([103, 100]) });
    expect(sealed.status).not.toBe('complete'); // avoid counts as a wall → only path sealed
    expect(sealed.tiles.some((t) => t.x === 103 && t.y === 100)).toBe(false);
  });
});
