import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two walkability oracles inside walkability-service answer DIFFERENT questions:
 *   - `hasLineOfWalk` is a terrain LOS raycast (no corner-cut) — the attack/interaction
 *     line check.
 *   - the A* corner-cut (walkability-service.ts:394-398) mirrors the canonical movement step.
 *
 * This test pins the unit-level contradiction: on a pure
 * diagonal whose two flanking corners are walls, `hasLineOfWalk` admits the hop while the
 * A* corner-cut refuses it. Both oracles are faithful mirrors of distinct canonical functions.
 */

const WORLD = 4096;
const HEIGHT_BYTES = WORLD * WORLD;

/** Install a heightmap with arbitrary per-tile heights. Mirrors the sibling test harness. */
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

describe('walkability oracles disagree on a diagonal corner-pinch (by design)', () => {
  // (5,5)->(6,6) NE diagonal; both flanking corners (6,5) and (5,6) are walls (0x7F).
  const PINCH_HEIGHTS: ReadonlyArray<readonly [number, number, number]> = [
    [6, 5, 127], // flank A
    [5, 6, 127], // flank B
    // (6,6) stays flat 0 — the destination tile itself clears the ±8 height test.
  ];

  it('hasLineOfWalk ADMITS the diagonal pinch (never samples the flank corners)', async () => {
    const svc = await loadServiceWithHeights(PINCH_HEIGHTS);
    // The Bresenham/DDA visits only (5,5) and (6,6); the flank walls are invisible to it.
    expect(svc.hasLineOfWalk(5, 5, 6, 6)).toBe(true);
  });

  it('the A* corner-cut REFUSES the same single-hop diagonal (both flanks are walls)', async () => {
    const svc = await loadServiceWithHeights(PINCH_HEIGHTS);
    const { tiles, codes } = svc.searchRoute(5, 5, 6, 6);
    // A* may still reach (6,6) by a longer contour, but it must NOT take the single NE hop:
    // a one-hop NE route would be tiles=[(5,5),(6,6)] with codes=[0x39].
    const tookSingleNeHop = codes.length === 1 && codes[0] === 0x39 && tiles.length === 2;
    expect(tookSingleNeHop).toBe(false);
    // With both flanks walled and (5,5)/(6,6) the only diagonal-clear cells, the corner-cut
    // seals the diagonal entirely → the goal is unreachable within the corridor.
    // (Either status 'unreachable' with empty tiles, or a contour that is NOT the 1-hop NE.)
  });

  it('CONTROL: with ONE flank open, BOTH oracles admit the diagonal (corner-cut needs only one cardinal)', async () => {
    // Only (6,5) walled; (5,6) is open (flat 0). The corner-cut admits a diagonal if EITHER
    // flank is walkable, so the two oracles AGREE here — proving the disagreement above is
    // specific to the both-flanks-walled pinch.
    const svc = await loadServiceWithHeights([[6, 5, 127]]);
    expect(svc.hasLineOfWalk(5, 5, 6, 6)).toBe(true);
    const { tiles, codes } = svc.searchRoute(5, 5, 6, 6);
    const tookSingleNeHop = codes.length === 1 && codes[0] === 0x39 && tiles.length === 2;
    expect(tookSingleNeHop).toBe(true);
  });
});
