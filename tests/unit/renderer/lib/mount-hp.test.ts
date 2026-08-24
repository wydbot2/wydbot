import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the item DB so we control `baseHp` (mountInfo.baseHp) directly.
const { getItem } = vi.hoisted(() => ({ getItem: vi.fn() }));
vi.mock('../../../../src/renderer/lib/item-db', () => ({ getItem }));

import { getMountMaxHp } from '../../../../src/renderer/lib/mount-hp';

/** Force `getMountMaxHp` to use a known base HP. */
const withBaseHp = (baseHp: number): void => {
  getItem.mockReturnValue({ mountInfo: { baseHp } });
};

describe('getMountMaxHp — level multiplier (game)', () => {
  beforeEach(() => getItem.mockReset());

  it('applies +10%..+100% across the 8 level bands (floor(byte/10))', () => {
    withBaseHp(10000);
    expect(getMountMaxHp(1, 0x82)).toBe(11000); // band 13 → +10%
    expect(getMountMaxHp(1, 0x8c)).toBe(12000); // band 14 → +20%
    expect(getMountMaxHp(1, 0x96)).toBe(13000); // band 15 → +30%
    expect(getMountMaxHp(1, 0xa0)).toBe(14000); // band 16 → +40%
    expect(getMountMaxHp(1, 0xaa)).toBe(15000); // band 17 → +50%
    expect(getMountMaxHp(1, 0xb4)).toBe(16500); // band 18 → +65%
    expect(getMountMaxHp(1, 0xbe)).toBe(18000); // band 19 → +80%
    expect(getMountMaxHp(1, 0xc8)).toBe(20000); // band 20 → +100%
  });

  it('treats a whole 10-wide band uniformly', () => {
    withBaseHp(10000);
    // Every byte in 0x8C..0x95 is band 14 → +20%.
    for (const byte of [0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x94, 0x95]) {
      expect(getMountMaxHp(1, byte)).toBe(12000);
    }
  });

  it('gives no bonus and no cap for bytes below 0x82', () => {
    withBaseHp(10000);
    expect(getMountMaxHp(1, 0x00)).toBe(10000);
    expect(getMountMaxHp(1, 0x81)).toBe(10000);
  });

  it('falls back to the default +10% above the table (byte >= 0xD2)', () => {
    withBaseHp(10000);
    expect(getMountMaxHp(1, 0xd2)).toBe(11000);
    expect(getMountMaxHp(1, 0xff)).toBe(11000);
  });

  it('regression: bytes >= 0x95 are no longer treated as ×1.0', () => {
    withBaseHp(10000);
    expect(getMountMaxHp(1, 0x95)).toBe(12000); // band 14 → +20% (was ×1.0)
    expect(getMountMaxHp(1, 0x96)).toBe(13000); // band 15 → +30% (was ×1.0)
  });

  it('clamps the result to 64000', () => {
    withBaseHp(40000);
    expect(getMountMaxHp(1, 0xc8)).toBe(64000); // 40000 + 100% = 80000 → capped
  });

  it('truncates the bonus to an integer (matches canonical integer math)', () => {
    withBaseHp(1001);
    // +65%: 1001 + trunc(65 * 1001 / 100) = 1001 + 650 = 1651.
    expect(getMountMaxHp(1, 0xb4)).toBe(1651);
  });

  it('falls back to base 7000 when the item or mountInfo is missing', () => {
    getItem.mockReturnValue(undefined);
    expect(getMountMaxHp(1, 0x8c)).toBe(8400); // 7000 + 20%
    getItem.mockReturnValue({ mountInfo: undefined });
    expect(getMountMaxHp(1, 0x8c)).toBe(8400);
  });

  it('uses a present baseHp of 0 as-is (nullish fallback does not catch 0)', () => {
    withBaseHp(0);
    expect(getMountMaxHp(1, 0xc8)).toBe(0);
  });
});
