import { describe, expect, it } from 'vitest';
import { nearestReachableByRoute } from '@renderer/lib/macro-attack-engagement';
import type { Target } from '@renderer/lib/macro-attack-engagement';

const mob = (index: number, x: number, y: number): Target => ({
  index,
  pos: { x, y },
  name: `mob-${index}`,
});

describe('nearestReachableByRoute — target selection by route distance', () => {
  it('picks the candidate with the smallest route cost', () => {
    const cands = [mob(1, 10, 0), mob(2, 5, 0), mob(3, 8, 0)];
    const cost = new Map([
      [1, 12],
      [2, 4],
      [3, 7],
    ]);
    const winner = nearestReachableByRoute(cands, (c) => cost.get(c.index) ?? null);
    expect(winner?.index).toBe(2);
  });

  it('ignores an unreachable candidate even if it is the nearest by straight line', () => {
    // mob 1 is Chebyshev-nearest but sealed (no route); mob 2 is farther but reachable.
    const cands = [mob(1, 3, 0), mob(2, 9, 0)];
    const winner = nearestReachableByRoute(cands, (c) => (c.index === 1 ? null : 9));
    expect(winner?.index).toBe(2);
  });

  it('prefers a clear-far mob over a walled-near one (route, not Chebyshev)', () => {
    // mob 1 is closer in a straight line but its route contours long (15); mob 2 is straight (5).
    const cands = [mob(1, 3, 0), mob(2, 5, 0)];
    const cost = new Map([
      [1, 15],
      [2, 5],
    ]);
    const winner = nearestReachableByRoute(cands, (c) => cost.get(c.index) ?? null);
    expect(winner?.index).toBe(2);
  });

  it('returns null for an empty candidate list', () => {
    expect(nearestReachableByRoute([], () => 1)).toBeNull();
  });

  it('returns null when every candidate is unreachable', () => {
    const cands = [mob(1, 3, 0), mob(2, 9, 0)];
    expect(nearestReachableByRoute(cands, () => null)).toBeNull();
  });

  it('keeps the first candidate on a route-cost tie (deterministic)', () => {
    const cands = [mob(1, 3, 0), mob(2, 4, 0)];
    const winner = nearestReachableByRoute(cands, () => 6);
    expect(winner?.index).toBe(1);
  });
});
