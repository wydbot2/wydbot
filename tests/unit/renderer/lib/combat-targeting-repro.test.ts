import { describe, expect, it, vi } from 'vitest';
import { attackDistance, chebyshev } from '@shared/lib/movement-math';
import type { MPosition } from '@shared/types';

/**
 * Spec for the surgical LUT attack fix (combat-targeting-probe). Encodes the
 * and the approach stops within range with a clear angle instead of gluing.
 */

const WORLD = 4096;
const HEIGHT_BYTES = WORLD * WORLD;

const installWydAPI = (walls: ReadonlyArray<readonly [number, number]> = []): void => {
  const heightBuf = new ArrayBuffer(HEIGHT_BYTES); // flat (all 0) → every step clears ±8
  if (walls.length > 0) {
    const h = new Int8Array(heightBuf);
    for (const [wx, wy] of walls) h[wy * WORLD + wx] = 127; // 0x7F = blocked sentinel
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

const loadPickers = async (walls: ReadonlyArray<readonly [number, number]> = []) => {
  vi.resetModules();
  installWydAPI(walls);
  const svcMod = await import('@renderer/lib/walkability-service');
  await svcMod.getWalkabilityService().ready();
  const pickers = await import('@renderer/lib/walkability-pickers');
  return { svc: svcMod.getWalkabilityService(), ...pickers };
};

describe('attackDistance — canonical octile LUT', () => {
  it('a diagonal target at Chebyshev 4 is canonical distance 5 (out of range for attackRange=4)', () => {
    const p: MPosition = { x: 0, y: 0 };
    expect(chebyshev(p, { x: 4, y: 4 })).toBe(4); // what the old gate used (in range)
    expect(attackDistance(p, { x: 4, y: 4 })).toBe(5); // canonical (out of range)
  });

  it('pure diagonals (k,k) cost Chebyshev+1 for k=2..5; k=1 (melee adjacent) agrees', () => {
    const k = (n: number): number => attackDistance({ x: 0, y: 0 }, { x: n, y: n });
    expect([1, 2, 3, 4, 5].map(k)).toEqual([1, 3, 4, 5, 6]);
    expect(attackDistance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1);
  });

  it('cardinals match step count; beyond the 7-window uses max+1', () => {
    expect(attackDistance({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(4);
    expect(attackDistance({ x: 0, y: 0 }, { x: 8, y: 0 })).toBe(9);
    expect(attackDistance({ x: 0, y: 0 }, { x: 8, y: 8 })).toBe(9);
  });
});

describe('pickAttackTileAround — stop within range, with a clear angle (not glued)', () => {
  const mob: MPosition = { x: 120, y: 120 };

  it('attackRange=4 stops WITHIN range and does NOT glue to the mob', async () => {
    const { pickAttackTileAround } = await loadPickers();
    const t = pickAttackTileAround(mob, 4, { x: 112, y: 120 });
    expect(t).not.toBeNull();
    expect(attackDistance(t!, mob)).toBeLessThanOrEqual(4); // in canonical range
    expect(chebyshev(t!, mob)).toBeGreaterThan(1); // not glued
  });

  it('when the target is just outside range, returns a real move (not a 1-tile no-op the mover ignores)', async () => {
    const { pickAttackTileAround } = await loadPickers();
    // from is LUT-distance 5 from the mob (just outside range 4); the nearest in-range tile is
    // 1 step away — which the mover would treat as already-arrived and never walk.
    const from = { x: 125, y: 120 };
    expect(attackDistance(from, mob)).toBe(5);
    const t = pickAttackTileAround(mob, 4, from);
    expect(t).not.toBeNull();
    expect(attackDistance(t!, mob)).toBeLessThanOrEqual(4); // lands in range
    expect(chebyshev(from, t!)).toBeGreaterThan(1); // a genuine move, not a no-op
  });

  it('attackRange=1 (melee) still picks an adjacent tile', async () => {
    const { pickAttackTileAround } = await loadPickers();
    const t = pickAttackTileAround(mob, 1, { x: 112, y: 120 });
    expect(t).not.toBeNull();
    expect(chebyshev(t!, mob)).toBe(1);
  });

  it('never returns a tile that is canonically out of range (e.g. the diagonal-4 corner at LUT 5)', async () => {
    const { pickAttackTileAround } = await loadPickers();
    const t = pickAttackTileAround(mob, 4, { x: 128, y: 128 }); // approach from the diagonal corner
    expect(t).not.toBeNull();
    expect(attackDistance(t!, mob)).toBeLessThanOrEqual(4);
  });

  it('with a wall on the direct line, returns a tile that has a clear angle (LOS) to the mob', async () => {
    // Vertical wall just west of the mob blocks the straight west approach.
    const walls: Array<[number, number]> = [];
    for (let dy = -3; dy <= 3; dy++) walls.push([119, 120 + dy]);
    const { svc, pickAttackTileAround } = await loadPickers(walls);
    const t = pickAttackTileAround(mob, 4, { x: 112, y: 120 });
    expect(t).not.toBeNull();
    expect(svc.hasLineOfWalk(t!.x, t!.y, mob.x, mob.y)).toBe(true); // clear angle, not through the wall
    expect(attackDistance(t!, mob)).toBeLessThanOrEqual(4);
  });
});
