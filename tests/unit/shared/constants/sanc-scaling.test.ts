import { describe, it, expect } from 'vitest';

import { getSancMultiplier, isWeaponType1, isWeaponSubType1 } from '@shared/constants/sanc-scaling';

describe('isWeaponType1', () => {
  it('returns true for items in the excluded ranges (e.g. 3741)', () => {
    expect(isWeaponType1(3741)).toBe(true);
  });

  it('returns true for items in the sub-type-1 range (6466-6481)', () => {
    expect(isWeaponType1(6470)).toBe(true);
  });

  it('returns false for a non-weapon item (e.g. 100)', () => {
    expect(isWeaponType1(100)).toBe(false);
  });
});

describe('isWeaponSubType1', () => {
  it('returns true for items 6466-6481', () => {
    expect(isWeaponSubType1(6470)).toBe(true);
  });

  it('returns false for item 3741 (sub "other")', () => {
    expect(isWeaponSubType1(3741)).toBe(false);
  });
});

describe('getSancMultiplier', () => {
  it('returns 100% for sancLevel 0', () => {
    expect(getSancMultiplier(0, 3741)).toBe(100);
  });

  it('uses TABLE B for weapon type-1 sub-other (item 3741) at level 5', () => {
    expect(getSancMultiplier(5, 3741)).toBe(310);
  });

  it('uses TABLE B for weapon type-1 sub-other at level 15', () => {
    expect(getSancMultiplier(15, 3741)).toBe(560);
  });

  it('uses TABLE A for weapon type-1 sub-1 (item 6470) at level 5', () => {
    expect(getSancMultiplier(5, 6470)).toBe(420);
  });

  it('uses DEFAULT for non-weapon at level 5', () => {
    expect(getSancMultiplier(5, 100)).toBe(150);
  });

  it('uses TABLE HIGH for non-weapon at level 15', () => {
    expect(getSancMultiplier(15, 100)).toBe(370);
  });

  it('produces correct wire-effect scaling for item 3741 at level 15', () => {
    const mult = getSancMultiplier(15, 3741);
    expect(Math.trunc((21 * mult) / 100)).toBe(117);
    expect(Math.trunc((64 * mult) / 100)).toBe(358);
  });
});
