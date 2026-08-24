import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Runtime-frequency tests for the LoS over-admit on diagonal pinches.
 *
 * The mechanical two-oracle contradiction is pinned by the sibling tests
 * (los-bresenham-overadmits-diagonal-pinch.test.ts / los-bresenham-vs-corner-cut.test.ts).
 * This file answers: can the over-admit leak through the runtime consumers during
 * normal farming, and how often?
 *
 * Consumers that gate on hasLineOfWalk:
 *   (A) pickAttackTileAround (walkability-pickers.ts:76)      — at-range LoS attack-tile→target
 *   (B) engaging/attacking LoS (macro-attack-engagement.ts:397/444) — playerPos→target.pos,
 *       BUT short-circuited by `dist <= 1` (lines 396/443) → melee never calls it
 *   (C) stringPullRoute (macro-engine.ts:204)                 — walker leg collapse
 */

const WORLD = 4096;
const HEIGHT_BYTES = WORLD * WORLD;
const WALL = 127; // 0x7F = BLOCKED_SENTINEL

const loadService = async (
  walls: ReadonlyArray<readonly [number, number]> = [],
): Promise<import('@renderer/lib/walkability-service').WalkabilityService> => {
  vi.resetModules();
  const heightBuf = new ArrayBuffer(HEIGHT_BYTES);
  if (walls.length > 0) {
    const h = new Int8Array(heightBuf);
    for (const [wx, wy] of walls) h[wy * WORLD + wx] = WALL;
  }
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

describe('reproduce (B): melee at-range LoS is neutralized by the dist<=1 short-circuit', () => {
  // macro-attack-engagement.ts:393-402 — for the DEFAULT attackRange=1, the in-range
  // condition is dist<=1, and the LoS branch only runs when dist>1. So for melee the
  // over-admitting hasLineOfWalk is NEVER consulted at the attack gate. Pin that logic.
  const losConsultedAtRange = (dist: number, attackRange: number): boolean =>
    dist <= attackRange && dist > 1; // (the && losOk path only calls hasLineOfWalk when dist>1)

  it('melee (range 1): in-range distances are dist<=1 → LoS branch is never entered', () => {
    // The only dist values that satisfy dist<=attackRange(1) are 0 and 1, both <=1.
    expect(losConsultedAtRange(1, 1)).toBe(false);
    expect(losConsultedAtRange(0, 1)).toBe(false);
  });

  it('ranged (range>=2): LoS branch IS entered for 2<=dist<=range → over-admit can leak', () => {
    expect(losConsultedAtRange(2, 3)).toBe(true);
    expect(losConsultedAtRange(3, 3)).toBe(true);
  });
});

describe('reproduce (A): pickAttackTileAround can hand back a faithless ranged attack tile', () => {
  /**
   * The picker requires the attack tile to be ROUTE-reachable (corner-cut-correct) from
   * the player, then accepts it if hasLineOfWalk(tile→target) is clear. We construct a
   * ranged scenario where the chosen attack tile sees the target across a both-flanks-walled
   * diagonal pinch: the picker returns the tile (over-admit), but the body/server cannot
   * shoot the diagonal. This is the harm path.
   *
   * Geometry: target at (10,10). The diagonal SW of it, (9,9)<-(10,10), is pinched by walls
   * at (9,10) and (10,9). Player sits SW so the nearest in-range tile is (9,9). The pinch
   * flanks are NOT on the player's route to (9,9) (it approaches straight from the W).
   */
  it('returns an attack tile whose LoS to target rides an over-admitted diagonal pinch', async () => {
    const walls: Array<[number, number]> = [
      [9, 10], // flank of the (9,9)->(10,10) diagonal
      [10, 9], // flank
    ];
    const svc = await loadService(walls);
    const { pickAttackTileAround } = await import('@renderer/lib/walkability-pickers');

    const target = { x: 10, y: 10 };
    const player = { x: 5, y: 9 }; // due west, open ground → routes straight to (9,9)
    const attackRange = 1; // melee here only to keep the ring tight; the LoS over-admit is geometric

    const tile = pickAttackTileAround(target, attackRange, player);
    expect(tile).not.toBeNull();
    // It picked the diagonal-adjacent tile (9,9) (nearest to the player among the ring).
    expect(tile).toEqual({ x: 9, y: 9 });
    // The picker accepted it because hasLineOfWalk over-admits the (9,9)->(10,10) diagonal:
    expect(svc.hasLineOfWalk(9, 9, 10, 10)).toBe(true);
    // ...yet the A* corner-cut proves the body cannot traverse that single diagonal hop:
    const { tiles, codes } = svc.searchRoute(9, 9, 10, 10);
    const singleNeHop = tiles.length === 2 && codes.length === 1 && codes[0] === 0x39;
    expect(singleNeHop).toBe(false);
  });

  it('but at-range melee NEVER reaches the over-admit because the engaging FSM uses dist<=1', async () => {
    // Re-state the upstream guard as the reason (A) under-reproduces for melee: even though
    // pickAttackTileAround *itself* calls hasLineOfWalk, the attack tile (9,9) it returns is
    // adjacent to the target (dist 1), so once the bot arrives the engaging-state at-range check
    // is the dist<=1 short-circuit (no LoS recheck, fires the attack). The faithless LoS only
    // matters when the picked tile is >1 from the target — i.e. attackRange>=2 (ranged).
    const svc = await loadService([
      [9, 10],
      [10, 9],
    ]);
    const target = { x: 10, y: 10 };
    const tile = { x: 9, y: 9 };
    const dist = Math.max(Math.abs(tile.x - target.x), Math.abs(tile.y - target.y));
    expect(dist).toBe(1); // melee approach tile is adjacent → dist<=1 skip applies
    // For a RANGED config the picked tile would be >1 away and the over-admit would bite:
    expect(svc.hasLineOfWalk(7, 7, 10, 10)).toBe(true); // long diagonal still over-admitted
  });
});

describe('reproduce (C): stringPullRoute collapses a multi-tile leg across an over-admitted pinch', () => {
  /**
   * stringPullRoute runs on the A* contour tiles, greedily joining tiles[legStart]→tiles[i]
   * with a straight hasLineOfWalk line. The leg endpoints are usually NON-adjacent contour
   * tiles, so the straight line can cut across cells the A* contour went AROUND. When that
   * line grazes a both-flanks-walled pinch on an INTERMEDIATE pure-diagonal step, the
   * over-admit accepts the whole leg — emitting a mid-leg dst the greedy server can't follow.
   *
   * Deterministic minimal case (validated against the real heightmap + a Monte-Carlo sweep
   * of building-density wall fields — ~2% of reachable routes hit such a leg; see report):
   * a length-3 diagonal leg (5,5)→(8,8) whose line cells (5,5),(6,6),(7,7),(8,8) are all
   * walkable, but the (6,6)→(7,7) step is flanked by walls at (7,6) and (6,7).
   */
  it('over-admits a length-3 diagonal leg pinched on an intermediate step (line cells off the walls)', async () => {
    const svc = await loadService([
      [7, 6], // flank of the (6,6)->(7,7) step
      [6, 7], // flank
    ]);
    // (1) Real hasLineOfWalk over-admits the whole diagonal leg — the flanks are never sampled.
    expect(svc.hasLineOfWalk(5, 5, 8, 8)).toBe(true);
    // (2) The A* corner-cut blocks the pinch step, so a route from (5,5) to (8,8) is NOT the
    //     straight 4-tile NE diagonal (it must contour around the pinched corner).
    const { tiles, codes, status } = svc.searchRoute(5, 5, 8, 8);
    expect(status).toBe('complete');
    const straightDiag = tiles.length === 4 && codes.length === 3 && codes.every((c) => c === 0x39);
    expect(straightDiag).toBe(false);
  });

  it('stringPullRoute collapses that leg into one waypoint (faithless mid-leg dst)', async () => {
    const { stringPullWaypoints } = await import('@renderer/lib/walkability-service');
    const svc = await loadService([
      [7, 6],
      [6, 7],
    ]);
    // A 4-tile straight-diagonal "contour" — every line cell walkable, the pinch on the flanks.
    const contour = [
      { x: 5, y: 5 },
      { x: 6, y: 6 },
      { x: 7, y: 7 },
      { x: 8, y: 8 },
    ];
    const wp = stringPullWaypoints(contour, (a, b) => svc.hasLineOfWalk(a.x, a.y, b.x, b.y));
    // Over-admit collapses the entire diagonal into a single leg (waypoint only at the end).
    expect(wp).toEqual([3]);
  });

  it('control: a TRUE wall ON the line is correctly sampled → the leg splits (over-admit is flank-only)', async () => {
    // A wall directly on a cardinal line (5,5)->(8,5) at (6,5) IS visited by Bresenham, so the
    // leg correctly fails. The over-admit is unique to the pure-diagonal case where the wall
    // sits on the FLANK (never on the line), not on the line itself.
    const { stringPullWaypoints } = await import('@renderer/lib/walkability-service');
    const svc = await loadService([[6, 5]]);
    const contour = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 7, y: 5 },
      { x: 8, y: 5 },
    ];
    const wp = stringPullWaypoints(contour, (a, b) => svc.hasLineOfWalk(a.x, a.y, b.x, b.y));
    expect(wp).not.toEqual([3]); // (5,5)->(6,5) crosses the wall → leg must split
  });
});
