/**
 * Unit tests for the `euclidean` distance helper — the canonical entity render
 *
 * Regression: the minimap draw gate previously used `chebyshev` (a square box),
 * which drew corner entities the canonical circle excludes. These tests pin the
 * metric and the exact ghost captured in the field.
 */

import { describe, it, expect } from 'vitest';
import { euclidean, chebyshev } from '@shared/lib/movement-math';
import type { MPosition } from '@shared/types';

describe('euclidean', () => {
  it('is the straight-line distance (3-4-5)', () => {
    expect(euclidean({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('equals 36 on the cardinal boundary — the `>= 36` gate excludes it (canonical strict `<`)', () => {
    expect(euclidean({ x: 0, y: 0 }, { x: 36, y: 0 })).toBe(36);
  });

  it('captured ghost: a diagonal corner sits inside the chebyshev box but outside the euclidean circle', () => {
    const player: MPosition = { x: 3907, y: 3636 };
    const cursedRanger: MPosition = { x: 3871, y: 3605 }; // dx=36, dy=31
    expect(chebyshev(player, cursedRanger)).toBe(36); // old gate drew it (<= 36)
    expect(euclidean(player, cursedRanger)).toBeCloseTo(47.5, 1); // new gate skips it (>= 36)
    expect(euclidean(player, cursedRanger)).toBeGreaterThanOrEqual(36);
  });
});
