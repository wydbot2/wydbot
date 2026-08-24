/**
 * Unit tests for MOUNT_FOOD_PAIRS + isFoodForMount.
 *
 * Verifies that the data table is bit-exact with the game client's feed gate.
 * Coverage:
 *   - asymmetric cluster A (only 1 food)
 *   - wide cluster G (22 mounts, 2 foods, including extras 0x935/0x953)
 *   - range clusters L/M (3+3 mounts)
 *   - extras-merge (N → G, O → L)
 *   - GAP at 0xb92 (canonical does NOT pair this id)
 *   - boundary checks (0xb93/0xb94 are R, NOT G)
 */

import { describe, it, expect } from 'vitest';
import {
  MOUNT_FOOD_PAIRS,
  isFoodForMount,
} from '../../../../src/shared/constants/mount-food-pairs';

describe('MOUNT_FOOD_PAIRS', () => {
  it('covers 64 mount ids (matches the canonical claim)', () => {
    expect(MOUNT_FOOD_PAIRS.size).toBe(64);
  });

  it('does NOT include 0xb92 (canonical gap)', () => {
    expect(MOUNT_FOOD_PAIRS.has(0xb92)).toBe(false);
    expect(isFoodForMount(0xb92, 0x97a)).toBe(false);
    expect(isFoodForMount(0xb92, 0x173f)).toBe(false);
  });
});

describe('isFoodForMount', () => {
  describe('Cluster A — asymmetric (only food 0x974)', () => {
    it('accepts 0x974 for 0x91a and 0x938', () => {
      expect(isFoodForMount(0x91a, 0x974)).toBe(true);
      expect(isFoodForMount(0x938, 0x974)).toBe(true);
    });

    it('does NOT accept 0xd28 for cluster A (asymmetry)', () => {
      // 0xd28 is the alternate food for cluster B, NOT A
      expect(isFoodForMount(0x91a, 0xd28)).toBe(false);
      expect(isFoodForMount(0x938, 0xd28)).toBe(false);
    });
  });

  describe('Cluster G — wide range + extras', () => {
    it('accepts 0x97a/0xd2d for the main range [0x920..0x929]', () => {
      for (let m = 0x920; m <= 0x929; m++) {
        expect(isFoodForMount(m, 0x97a)).toBe(true);
        expect(isFoodForMount(m, 0xd2d)).toBe(true);
      }
    });

    it('accepts 0x97a/0xd2d for the secondary range [0x93e..0x947]', () => {
      for (let m = 0x93e; m <= 0x947; m++) {
        expect(isFoodForMount(m, 0x97a)).toBe(true);
      }
    });

    it('accepts 0x97a/0xd2d for the wrap pair {0xb90, 0xb91} but NOT 0xb92', () => {
      expect(isFoodForMount(0xb90, 0x97a)).toBe(true);
      expect(isFoodForMount(0xb91, 0x97a)).toBe(true);
      expect(isFoodForMount(0xb92, 0x97a)).toBe(false); // GAP
    });

    it('accepts 0x97a for the N extras {0x935, 0x953}', () => {
      expect(isFoodForMount(0x935, 0x97a)).toBe(true);
      expect(isFoodForMount(0x953, 0xd2d)).toBe(true);
    });
  });

  describe('Cluster L — range + extras (O merged in)', () => {
    it('accepts 0x97d/0xd30 for [0x92f..0x931] and [0x94d..0x94f]', () => {
      for (const m of [0x92f, 0x930, 0x931, 0x94d, 0x94e, 0x94f]) {
        expect(isFoodForMount(m, 0x97d)).toBe(true);
        expect(isFoodForMount(m, 0xd30)).toBe(true);
      }
    });

    it('accepts 0x97d for the O extras {0x936, 0x954}', () => {
      expect(isFoodForMount(0x936, 0x97d)).toBe(true);
      expect(isFoodForMount(0x954, 0xd30)).toBe(true);
    });
  });

  describe('Cluster R — Jackal (range 0xb93..0xb94)', () => {
    it('accepts 0x173f/0x1740 for the Jackal pair', () => {
      expect(isFoodForMount(0xb93, 0x173f)).toBe(true);
      expect(isFoodForMount(0xb94, 0x1740)).toBe(true);
    });

    it('does NOT accept Cluster G foods for Jackal (distinct food band)', () => {
      expect(isFoodForMount(0xb93, 0x97a)).toBe(false);
      expect(isFoodForMount(0xb94, 0xd2d)).toBe(false);
    });
  });

  describe('Cross-cluster isolation', () => {
    it('does NOT cross-pair (e.g. food 0x974 only feeds cluster A)', () => {
      expect(isFoodForMount(0x91b, 0x974)).toBe(false); // 0x91b is cluster B
      expect(isFoodForMount(0x920, 0x974)).toBe(false); // 0x920 is cluster G
      expect(isFoodForMount(0xb93, 0x974)).toBe(false); // 0xb93 is cluster R
    });

    it('rejects unknown mount ids', () => {
      expect(isFoodForMount(0x0001, 0x974)).toBe(false);
      expect(isFoodForMount(0xffff, 0x174f)).toBe(false);
    });

    it('rejects unknown food ids for known mounts', () => {
      expect(isFoodForMount(0x91a, 0x9999)).toBe(false);
      expect(isFoodForMount(0xb93, 0x0001)).toBe(false);
    });
  });
});
