/**
 * Target selection tie-break + ranking metric diverge from canonical.
 * src/renderer/lib/macro-attack-engagement.ts:60
 *   `if (cost === null || cost >= bestCost) continue;`  // STRICT `>=`
 *   ranked by `route.tiles.length - 1` (A* contour step count, line 177-180),
 *   over candidates pulled in store order (`useGameStore.getState().entities`,
 *   line 160/163).
 *
 * Two divergences:
 *
 *   (1) RANKING METRIC. The macro ranks by A* path length, not LUT distance. A
 *       mob around a corner has a larger A* cost but can have a smaller LUT
 *       distance, so the macro locks a DIFFERENT target than canonical from
 *       identical world state => different chase + different 0x36C/0x39D stream.
 *
 *   (2) TIE-BREAK. Because `>=` keeps the FIRST minimum, exact route-cost ties
 *       are resolved by entity-array position. `addEntity` slot-collision
 *       re-appends (`game-store.ts:48-49` `[...filtered, seen]`), so the SAME two
 *       mobs can swap selection between scans => target thrash, a fresh approach
 *       `requestMove` to a new tile each flip.
 *
 * EXPECTED (server-faithful): target selection is a stable function of world
 *   state — independent of the order entities happen to sit in the store — and
 *   ranks by LUT line-distance.
 * ACTUAL: selection flips with array order on ties, and ranks by A* step count.
 *
 * PROOF STYLE: `it.fails` — each body asserts the CORRECT behavior; the buggy
 * code makes it throw, so `it.fails` turns the throw into a green pass that
 * documents the defect. The day macro-attack-engagement.ts:60 is corrected
 * (order-independent tie-break + LUT-distance ranking), these bodies stop
 * throwing and `it.fails` goes RED — flip `it.fails` -> `it`.
 *
 * to fix: flip it.fails->it once src/renderer/lib/macro-attack-engagement.ts:60
 *   (and the ranking metric at line 177-180) is corrected.
 */

import { describe, it, expect } from 'vitest';
import { nearestReachableByRoute, type Target } from '@renderer/lib/macro-attack-engagement';

const mob = (index: number, name: string): Target => ({
  index,
  name,
  pos: { x: 0, y: 0 },
});

describe('target-tiebreak-array-order', () => {
  // --- Bug (2): tie-break must not depend on entity-array order ---
  it.fails(
    'EXPECTED: two equal-cost mobs select the SAME mob regardless of array order (ACTUAL: array-order picks the first)',
    () => {
      const A = mob(1, 'mobA');
      const B = mob(2, 'mobB');
      // Same two mobs, identical costs — only the array order differs.
      const cost = (c: Target): number => ({ 1: 7, 2: 7 })[c.index]!;

      const winnerForward = nearestReachableByRoute([A, B], cost)?.name;
      const winnerReversed = nearestReachableByRoute([B, A], cost)?.name;

      // Server-faithful: a stable distance rule yields ONE winner for identical
      // world state. The buggy `>=` makes the FIRST in array order win, so these
      // differ ('mobA' vs 'mobB') and this assertion throws -> it.fails passes.
      expect(winnerReversed).toBe(winnerForward);
    },
  );

  // --- Bug (1): ranking metric must be LUT line-distance, not A* step count ---
  it.fails(
    'EXPECTED: a LUT-closer mob is selected even when its A* contour is longer (ACTUAL: A*-step ranking picks the open-ground mob)',
    () => {
      // Mob A: short open-ground A* path (5 steps) but FARTHER in straight LUT
      // distance. Mob B: longer A* contour (8 steps, sits around a corner) but
      // CLOSER in straight LUT distance — the metric canonical ranks by.
      const A = mob(1, 'aroundOpenGround');
      const B = mob(2, 'closerLineOfSight');
      const routeCostAStarSteps = (c: Target): number => ({ 1: 5, 2: 8 })[c.index]!;
      const lutLineDistance: Record<number, number> = { 1: 9, 2: 4 };

      const macroPick = nearestReachableByRoute([A, B], routeCostAStarSteps)!;
      const canonicalPick = lutLineDistance[A.index] < lutLineDistance[B.index] ? A : B;

      // Server-faithful: rank by LUT distance => pick B ('closerLineOfSight').
      // The macro ranks by A* steps => picks A. This assertion throws -> it.fails passes.
      expect(macroPick.name).toBe(canonicalPick.name);
    },
  );

  // --- Sanity floor: the bug is ONLY on the metric/tie, not on a strict closer.
  // A strictly-lower-cost LATER candidate must still win regardless of order.
  // This is the part the code gets RIGHT, so it stays a normal green `it`.
  it('strictly-lower-cost later candidate wins regardless of array order (correct path)', () => {
    const A = mob(1, 'mobA');
    const B = mob(2, 'mobB'); // strictly lower cost
    const cost = (c: Target): number => ({ 1: 9, 2: 4 })[c.index]!;
    expect(nearestReachableByRoute([A, B], cost)?.name).toBe('mobB');
    expect(nearestReachableByRoute([B, A], cost)?.name).toBe('mobB');
  });
});
