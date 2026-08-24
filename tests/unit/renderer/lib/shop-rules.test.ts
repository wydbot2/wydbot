/**
 * Unit tests for shop pure helpers: resolveShopBuy, free bag slot, draft.
 */
import { describe, it, expect } from 'vitest';
import { encodeShopWireSlot } from '../../../../src/shared/lib/shop-slot';
import {
  resolveShopBuy,
  findFreeBagSlot,
  canSaveShop,
  buildShopTarget,
} from '../../../../src/renderer/lib/shop-rules';
import type { IpcShopItem } from '../../../../src/shared/ipc/ipc-api';
import type { ViewItem } from '../../../../src/shared/types/item-types';
import { EMPTY_VIEW_ITEM } from '../../../../src/renderer/lib/item-enrich';
import { MAXL_INVENTORY } from '../../../../src/shared/constants/game-basics';

describe('encodeShopWireSlot', () => {
  it('is identity for linear slots 0..8', () => {
    for (let i = 0; i <= 8; i++) {
      expect(encodeShopWireSlot(i)).toBe(i);
    }
  });

  it('maps page boundaries for s>=9', () => {
    expect(encodeShopWireSlot(9)).toBe(27);
    expect(encodeShopWireSlot(16)).toBe(34);
    expect(encodeShopWireSlot(18)).toBe(54);
    expect(encodeShopWireSlot(26)).toBe(62);
  });
});

describe('resolveShopBuy', () => {
  const items: IpcShopItem[] = [
    { itemId: 100, price: 10, slotIndex: 0 },
    { itemId: 200, price: 50, slotIndex: 9 },
  ];

  it('returns linear slotIndex from 0x17C inventory (encode happens at wire)', () => {
    expect(resolveShopBuy({ itemId: 200, quantity: 1 }, items)).toEqual({
      kind: 'buy',
      slotIndex: 9,
      itemId: 200,
    });
  });

  it('skips when item is not in shop', () => {
    expect(resolveShopBuy({ itemId: 999, quantity: 1 }, items)).toEqual({
      kind: 'skip',
      reason: 'item-not-in-shop',
    });
  });
});

describe('findFreeBagSlot', () => {
  const slot = (index: number): ViewItem =>
    index === 0 ? EMPTY_VIEW_ITEM : ({ ...EMPTY_VIEW_ITEM, index, name: 'x' } as ViewItem);

  it('returns first empty index', () => {
    const inv = [slot(100), slot(0), slot(200)];
    expect(findFreeBagSlot(inv)).toBe(1);
  });

  it('returns 0 when first slot empty', () => {
    expect(findFreeBagSlot([slot(0), slot(1)])).toBe(0);
  });

  it('returns -1 when bag full', () => {
    const inv = Array.from({ length: MAXL_INVENTORY }, (_, i) => slot(i + 1));
    expect(findFreeBagSlot(inv)).toBe(-1);
  });
});

describe('buildShopTarget / canSaveShop', () => {
  it('persists shop.open as config SoT', () => {
    expect(
      canSaveShop({ npcName: '  Smith  ', rules: [{ itemId: 1, quantity: 2 }], open: 'npc' }),
    ).toBe(true);
    expect(canSaveShop({ npcName: '', rules: [{ itemId: 1, quantity: 1 }], open: 'dialog' })).toBe(
      false,
    );
    expect(
      buildShopTarget({ npcName: '  Smith  ', rules: [{ itemId: 1, quantity: 2 }], open: 'npc' }),
    ).toEqual({
      npcName: 'Smith',
      shop: { rules: [{ itemId: 1, quantity: 2 }], open: 'npc' },
    });
  });
});
