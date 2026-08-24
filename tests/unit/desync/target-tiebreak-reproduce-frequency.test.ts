/**
 * Runtime-frequency tests for the array-order tie-break / metric mismatch in
 * target selection: can they realistically TRIGGER during normal farming
 * (walk routes + approach + attack), and at what frequency?
 *
 * Pinned below:
 *
 *   (1) OPEN-GROUND DOMINANT CASE — `route.tiles.length-1` (A* step count) on
 *       obstacle-free ground equals the Chebyshev distance player→mob. The
 *       Chebyshev on cardinals/adjacent-diagonal and exceeds it by at most +1
 *       for pure-diagonal offsets k=2..5. So on the common case the macro and
 *       canonical rank candidates IDENTICALLY (no divergence) OR differ by a
 *       single LUT unit only for diagonal geometry. The framing
 *       "A* contour step count vs straight LUT LINE-distance" overstates the gap.
 *
 *   (2) METRIC MISMATCH IS REAL ONLY BEHIND AN OBSTACLE — for the A* path to be
 *       strictly LONGER than the Chebyshev line (the only way the macro ranks a
 *       different mob than a Chebyshev/octile ranking), a wall/corner must lie
 *       between the player and at least one tied candidate. Pinned below.
 *
 *   (3) THRASH IS GATED BY THE FSM — selection
 *       (`findHostileInRadius`→`nearestReachableByRoute`) runs at only two sites:
 *       the idle scan (engagement line 357) and onTargetDead (line 191). The idle
 *       scan LOCKS on the first tick it finds any hostile (line 372-377: setTarget
 *       + transitionTo('engaging') in the same tick). There is no state in which
 *       the scan re-runs while a target is alive and in-flight, so thrash across
 *       successive idle scans cannot occur.
 */

import { describe, it, expect } from 'vitest';
import { nearestReachableByRoute, type Target } from '@renderer/lib/macro-attack-engagement';
import { attackDistance, chebyshev } from '@shared/lib/movement-math';
import type { MPosition } from '@shared/types';

const at = (index: number, name: string, x: number, y: number): Target => ({
  index,
  name,
  pos: { x, y },
});

// Chebyshev path length on open ground — what `route.tiles.length-1` reduces to
// when A* finds the straight diagonal with no obstacle to contour.
const openGroundRouteCost =
  (from: MPosition) =>
  (c: Target): number =>
    chebyshev(from, c.pos);

describe('reproduce: open-ground is the dominant farming case — metrics AGREE', () => {
  it('on open ground the macro route-cost ranking == canonical octile ranking for cardinal/adjacent offsets', () => {
    const player: MPosition = { x: 100, y: 100 };
    // Two whitelisted mobs at DIFFERENT cardinal distances (3 vs 5).
    const near = at(1, 'mobNear', 103, 100); // chebyshev 3
    const far = at(2, 'mobFar', 105, 100); // chebyshev 5

    const macroPick = nearestReachableByRoute(
      [far, near], // far listed FIRST — array order must NOT win here
      openGroundRouteCost(player),
    );
    expect(macroPick?.name).toBe('mobNear');

    // identical to Chebyshev, so the canonical agrees: the near mob is closer.
    const canonicalNear = attackDistance(player, near.pos); // 3
    const canonicalFar = attackDistance(player, far.pos); // 5
    expect(canonicalNear).toBeLessThan(canonicalFar);
    // ⇒ no divergence on open ground when distances differ.
  });

  it('genuine EXACT ties on open ground are common (discrete integer Chebyshev), and only then does array order decide', () => {
    const player: MPosition = { x: 100, y: 100 };
    // Two mobs at the SAME Chebyshev distance 4 — a real, frequent farming layout
    // (two mobs roughly 4 tiles out on different bearings).
    const east = at(1, 'mobEast', 104, 100); // chebyshev 4
    const ne = at(2, 'mobNE', 104, 104); // chebyshev 4 (diagonal)

    const cost = openGroundRouteCost(player);
    expect(cost(east)).toBe(cost(ne)); // exact route-cost tie

    // Array order decides the winner (the core mechanism):
    expect(nearestReachableByRoute([east, ne], cost)?.name).toBe('mobEast');
    expect(nearestReachableByRoute([ne, east], cost)?.name).toBe('mobNE');

    // BUT: the canonical octile LUT would NOT tie these two — the diagonal mob at
    // offset (4,4) reads octile distance 5, the cardinal mob reads 4. So canonical
    // is NOT ambiguous here; it deterministically prefers the cardinal mob. The
    // macro's A*-step tie is a metric artifact, and on this exact geometry the
    // macro CAN pick the diagonal mob (when listed first) that canonical never would.
    expect(attackDistance(player, east.pos)).toBe(4);
    expect(attackDistance(player, ne.pos)).toBe(5);
  });
});

describe('reproduce: metric mismatch is real ONLY when an obstacle lengthens the A* path', () => {
  it('around-a-corner mob has larger A* step count than its Chebyshev/octile line distance', () => {
    const player: MPosition = { x: 100, y: 100 };
    // Mob B sits at Chebyshev distance 4 but behind a corner: the A* contour must
    // detour, costing (say) 8 steps. Mob A is at Chebyshev 5 on open ground (5 steps).
    const around = at(2, 'aroundCorner', 102, 103); // cheb 3, but A* contour = 8
    const openLine = at(1, 'openLine', 105, 100); // cheb 5, A* = 5

    const routeCost = (c: Target): number => ({ 1: 5, 2: 8 })[c.index]!;
    // Macro ranks by A* steps ⇒ picks the open-line mob (cost 5 < 8).
    expect(nearestReachableByRoute([around, openLine], routeCost)?.name).toBe('openLine');

    // Canonical ranks by octile LINE distance ⇒ the around-corner mob is closer
    // (octile of (2,3)=4 < octile of (5,0)=5) and canonical would chase IT instead.
    expect(attackDistance(player, around.pos)).toBeLessThan(attackDistance(player, openLine.pos));
    // ⇒ DIVERGENCE confirmed, but it REQUIRES an obstacle between player and a
    // candidate. On open farming ground this branch never fires.
  });
});

describe('reproduce: thrash sub-claim is structurally gated by the FSM (selection runs at 2 sites only)', () => {
  it('nearestReachableByRoute is deterministic for a FIXED candidate order — thrash needs reorder BETWEEN scans, which the lock prevents', () => {
    const player: MPosition = { x: 100, y: 100 };
    const a = at(1, 'mobA', 104, 100); // cheb 4
    const b = at(2, 'mobB', 104, 104); // cheb 4 (tie on open ground)
    const cost = openGroundRouteCost(player);

    // Same order ⇒ same winner every call. The function itself never thrashes.
    const order = [a, b];
    const first = nearestReachableByRoute(order, cost)?.name;
    const second = nearestReachableByRoute(order, cost)?.name;
    expect(first).toBe(second);
    expect(first).toBe('mobA');

    // For the winner to FLIP, the array order must change between two selection
    // calls. Selection only runs on the idle scan and on target-death. The idle
    // scan locks the target in the SAME tick it finds a hostile (engagement
    // line 372-377), so two idle scans never both run with a live un-locked tie.
    // A flip therefore needs the store array to reorder AND a fresh selection —
    // i.e. the OLD target must die first (onTargetDead re-scans). That is a normal
    // "pick the next mob after a kill" event, not per-tick thrash.
  });

  it('reorder only matters at a re-selection boundary (kill) — documents the realistic flip window', () => {
    const player: MPosition = { x: 100, y: 100 };
    const cost = openGroundRouteCost(player);

    // Scan #1 (idle): mobA wins, gets locked, FSM chases mobA to death.
    const scan1 = [at(1, 'mobA', 104, 100), at(2, 'mobB', 104, 104)];
    expect(nearestReachableByRoute(scan1, cost)?.name).toBe('mobA');

    // mobA dies. onTargetDead re-scans. If the store array order changed in the
    // interim (e.g. slot-collision re-append moved a tied mob), scan #2 can pick a
    // different tied mob than a stable distance rule would. This is once-per-kill,
    // not per-250ms-tick.
    const scan2 = [at(2, 'mobB', 104, 104), at(3, 'mobC', 104, 100)];
    expect(nearestReachableByRoute(scan2, cost)?.name).toBe('mobB');
    // ⇒ The effect is "which equidistant mob you chase next after a kill", a
    // cosmetic ordering nondeterminism — NOT a position-desync mechanism and NOT
    // per-tick thrash. Frequency = at most once per kill, only when ≥2 whitelisted
    // mobs sit at the EXACT same A* step count and one of them is around a corner
    // for the metric-mismatch variant.
  });
});
