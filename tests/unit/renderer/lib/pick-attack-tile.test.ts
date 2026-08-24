/**
 * pickAttackTileAround — in-range LoS preference, expanding LoS-acquisition
 * rings, and null for sealed targets (no reachable-no-LoS fallback, which
 * oscillated the engagement against wall-diagonal targets).
 *
 * Exercises the REAL walkability-service over a synthetic heightmap: flat
 * zeros (walkable) with 0x7F wall cells written in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attackDistance } from '@shared/lib/movement-math';
import type { MPosition } from '@shared/types';

const WORLD = 4096;
const WALL = 0x7f;

let heights: Int8Array;

const wall = (x: number, y: number): void => {
  heights[y * WORLD + x] = WALL;
};

const installWydAPI = (): void => {
  (globalThis as unknown as { window: unknown }).window = {
    wydAPI: {
      getWalkabilityHeightmap: async () => ({
        buffer: heights.buffer,
        meta: { width: WORLD, height: WORLD, hash: 'test' },
      }),
    },
  };
};

type Pickers = typeof import('@renderer/lib/walkability-pickers');
type Svc = import('@renderer/lib/walkability-service').WalkabilityService;

const loadModules = async (): Promise<{ pickers: Pickers; svc: Svc }> => {
  vi.resetModules();
  installWydAPI();
  const svcMod = await import('@renderer/lib/walkability-service');
  const svc = svcMod.getWalkabilityService();
  await svc.ready();
  const pickers = await import('@renderer/lib/walkability-pickers');
  return { pickers, svc };
};

beforeEach(() => {
  heights = new Int8Array(WORLD * WORLD); // flat walkable
  vi.resetModules();
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

const TARGET: MPosition = { x: 100, y: 100 };

describe('pickAttackTileAround — open field', () => {
  it('returns an in-range tile with line-of-walk, nearest to the player', async () => {
    const { pickers, svc } = await loadModules();
    const from: MPosition = { x: 96, y: 100 };
    const t = pickers.pickAttackTileAround(TARGET, 2, from);
    expect(t).not.toBeNull();
    expect(attackDistance(t!, TARGET)).toBeLessThanOrEqual(2);
    expect(svc.hasLineOfWalk(t!.x, t!.y, TARGET.x, TARGET.y)).toBe(true);
    // Nearest in-range tile from (96,100): (98,100) — the picker must not walk
    // any deeper toward the target than the range requires.
    expect(Math.max(Math.abs(t!.x - from.x), Math.abs(t!.y - from.y))).toBe(2);
  });

  it('never returns a tile within ARRIVE_EPSILON of the player', async () => {
    const { pickers } = await loadModules();
    const from: MPosition = { x: 99, y: 100 };
    const t = pickers.pickAttackTileAround(TARGET, 1, from);
    expect(t).not.toBeNull();
    const dist = Math.max(Math.abs(t!.x - from.x), Math.abs(t!.y - from.y));
    expect(dist).toBeGreaterThan(1);
  });
});

describe('pickAttackTileAround — wall beside the target (range 2)', () => {
  it('still finds an in-range LoS tile on the open side (no acquisition needed)', async () => {
    // Vertical wall segment east of the target: blocks LoS/reach from the east,
    // but the west/north/south in-range tiles stay clear.
    for (let y = 98; y <= 102; y++) wall(101, y);
    const { pickers, svc } = await loadModules();
    const t = pickers.pickAttackTileAround(TARGET, 2, { x: 110, y: 100 });
    expect(t).not.toBeNull();
    expect(attackDistance(t!, TARGET)).toBeLessThanOrEqual(2);
    expect(svc.hasLineOfWalk(t!.x, t!.y, TARGET.x, TARGET.y)).toBe(true);
  });
});

describe('pickAttackTileAround — sealed target (C3 regression)', () => {
  it('returns null when every walkable approach crosses a wall (no more no-LoS fallback)', async () => {
    // Wall the full 8-neighbourhood: every line into the target crosses a wall.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        wall(TARGET.x + dx, TARGET.y + dy);
      }
    }
    const { pickers } = await loadModules();
    expect(pickers.pickAttackTileAround(TARGET, 2, { x: 110, y: 100 })).toBeNull();
  });
});
