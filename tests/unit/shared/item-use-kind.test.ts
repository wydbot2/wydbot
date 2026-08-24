/**
 * Unit tests for the item use-kind classifier
 * (src/shared/constants/item-use-kind.ts) — the single source of truth for
 *
 * Synthetic fixtures — one per kind plus the priority rules (blocked > popup >
 * hud > channel > menu > direct > equip).
 */

import { describe, expect, it } from 'vitest';

import {
  itemUseKind,
  CHANNEL_SCROLL_IDS,
  type UseKindInput,
} from '@shared/constants/item-use-kind';

const item = (id: number, cat?: number, itemClass = 0): UseKindInput => ({
  id,
  itemClass,
  effectSlots: cat === undefined ? [] : [{ idx: 0x26, value: cat }],
});

describe('itemUseKind — synthetic fixtures', () => {
  it('direct via category whitelist (potion cat 1, water scroll cat 0x15)', () => {
    expect(itemUseKind(item(400, 1))).toBe('direct');
    expect(itemUseKind(item(777, 0x15))).toBe('direct');
  });

  it('direct via gift-box itemClass 0x3d (no VOLATILE)', () => {
    expect(itemUseKind(item(9999, undefined, 0x3d))).toBe('direct');
  });

  it('direct via id whitelist (herb 415 — cat 0xf3 is NOT a direct category)', () => {
    expect(itemUseKind(item(415, 0xf3))).toBe('direct');
  });

  it('direct via id range (Kefra 1777–1779 — cat 0xf4 is NOT whitelisted)', () => {
    expect(itemUseKind(item(1777, 0xf4))).toBe('direct');
    expect(itemUseKind(item(1778, 0xf4))).toBe('direct');
    expect(itemUseKind(item(1779, 0xf4))).toBe('direct');
  });

  it('direct via dispatcher specials 0xd8b..0xd8f (cat 0/none)', () => {
    expect(itemUseKind(item(0xd8b))).toBe('direct');
    expect(itemUseKind(item(0xd8f, 0))).toBe('direct');
  });

  it('channel for cat 0xb/0xd (return + portal scrolls)', () => {
    expect(itemUseKind(item(410, 0xb))).toBe('channel');
    expect(itemUseKind(item(699, 0xd))).toBe('channel');
  });

  it('menu only for cat 0xc3 AND catalog membership', () => {
    expect(itemUseKind(item(0xd6c, 0xc3))).toBe('menu');
    expect(itemUseKind(item(0xdb4, 0xc3))).toBe('equip'); // unnamed edge, no catalog block
  });

  it('popup for cats 0xbb/0xce/0xd3 and id 0xd08', () => {
    expect(itemUseKind(item(4106, 0xbb))).toBe('popup');
    expect(itemUseKind(item(3443, 0xce))).toBe('popup');
    expect(itemUseKind(item(5338, 0xd3))).toBe('popup'); // Pedra Ideal — id-whitelisted, popup wins
    expect(itemUseKind(item(0xd08, 0))).toBe('popup');
  });

  it('hud for HUD-opening ids (0xd72 wins over its direct cat 0x13)', () => {
    expect(itemUseKind(item(0x1911))).toBe('hud');
    expect(itemUseKind(item(0x102d, 5))).toBe('hud');
    expect(itemUseKind(item(0xd72, 0x13))).toBe('hud');
    expect(itemUseKind(item(0x132b))).toBe('hud'); // SRP_Coupon — range id, hud wins
  });

  it('blocked beats everything (0xc87 inside the Jóias direct range)', () => {
    expect(itemUseKind(item(0xc87, 0xf3))).toBe('blocked');
    expect(itemUseKind(item(0x132a))).toBe('blocked'); // Victory_Coupon — range id, blocked wins
  });

  it('equip for everything else (no VOLATILE, non-whitelisted cat)', () => {
    expect(itemUseKind(item(1000))).toBe('equip');
    expect(itemUseKind(item(2390, 0x10))).toBe('equip'); // âmago — cat 0x10 not whitelisted
    expect(itemUseKind(item(417, 0))).toBe('equip'); // Adelas — cat 0 not whitelisted
  });
});

describe('CHANNEL_SCROLL_IDS', () => {
  it('covers every bundled cat-0xb/0xd scroll', () => {
    expect([...CHANNEL_SCROLL_IDS].sort((a, b) => a - b)).toEqual([
      410, 411, 699, 776, 3429, 3430, 3456,
    ]);
  });
});
