import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test: the two walkability oracles in walkability-service disagree on
 * a pure diagonal wall-corner pinch — hasLineOfWalk (Bresenham, lines 123-155)
 * admits the single diagonal hop, while the A* corner-cut (lines 394-398) rejects
 * it because it never samples the two flanking cardinal cells.
 *
 * Both shapes are faithful mirrors of the game client's own behavior (the client
 * uses both algorithms in the same roles), so the divergence is canonical-coherent
 * rather than a self-inflicted desync. This suite pins both behaviors.
 */

const WORLD = 4096;
const HEIGHT_BYTES = WORLD * WORLD;

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

describe('los-bresenham-overadmits-diagonal-pinch (canonical-faithful contradiction)', () => {
  it('hasLineOfWalk admits a diagonal pinch that the A* corner-cut rejects', async () => {
    // Wall the two flanking corner cells of the (5,5)->(6,6) NE diagonal.
    // (6,5) and (5,6) = 0x7F (BLOCKED). (5,5) and (6,6) stay flat (0).
    const svc = await loadServiceWithHeights([
      [6, 5, 127],
      [5, 6, 127],
    ]);

    // (1) hasLineOfWalk OVER-ADMITS: the Bresenham ray for a pure 45° diagonal samples
    //     only (5,5) and (6,6) — never the walled flanks — so it returns true.
    expect(svc.hasLineOfWalk(5, 5, 6, 6)).toBe(true);

    // (2) The A* corner-cut REJECTS the same single NE hop: both flanks are walls, so
    //     searchRoute must contour (more than 2 tiles) or fail to reach in one NE code.
    const { tiles, codes, status } = svc.searchRoute(5, 5, 6, 6);
    const tookSingleNeHop = status === 'complete' && tiles.length === 2 && codes.length === 1;
    expect(tookSingleNeHop).toBe(false);
  });

  it('control: with at least one flank open, BOTH oracles admit the diagonal (no contradiction)', async () => {
    // Only (6,5) walled; (5,6) open → corner-cut admits, Bresenham admits.
    const svc = await loadServiceWithHeights([[6, 5, 127]]);
    expect(svc.hasLineOfWalk(5, 5, 6, 6)).toBe(true);
    const { tiles, codes, status } = svc.searchRoute(5, 5, 6, 6);
    expect(status).toBe('complete');
    // The lenient corner-cut (≥1 flank open) lets the single NE hop through.
    expect(tiles).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 6 },
    ]);
    expect(codes).toEqual([0x39]);
  });
});
