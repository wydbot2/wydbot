import { describe, it, expect } from 'vitest';
import {
  resolveInteractService,
  interactServiceCategory,
  probeShopOpenOrder,
} from '../../../../src/renderer/lib/interact-service';
import type { InteractTarget } from '../../../../src/shared/app-config';

describe('resolveInteractService', () => {
  it('prefers shop payload and defaults open to dialog when missing', () => {
    const target = {
      npcName: 'Smith',
      npcCategory: 'unknown',
      shop: { rules: [{ itemId: 1, quantity: 2 }] },
    } as InteractTarget;
    // Simulate pre-default parse shape: open may be absent on raw objects
    const raw = {
      npcName: 'Smith',
      shop: { rules: [{ itemId: 1, quantity: 2 }] },
    } as InteractTarget;
    expect(resolveInteractService(raw)).toEqual({
      kind: 'shop',
      rules: [{ itemId: 1, quantity: 2 }],
      open: 'dialog',
    });
    expect(resolveInteractService({ ...target, shop: { ...target.shop!, open: 'npc' } })).toEqual({
      kind: 'shop',
      rules: [{ itemId: 1, quantity: 2 }],
      open: 'npc',
    });
  });

  it('resolves bank and compose from payloads, not npcCategory', () => {
    expect(
      resolveInteractService({
        npcName: 'Banker',
        npcCategory: 'shop',
        bank: { rules: [{ direction: 'deposit', target: 'gold', amount: 100 }] },
      }),
    ).toMatchObject({ kind: 'bank' });
    expect(
      resolveInteractService({
        npcName: 'Mix',
        compose: {
          actions: [
            {
              recipeIndex: 1,
              label: 'x',
              menuPath: [],
              ingredients: [],
            },
          ],
        },
      }),
    ).toMatchObject({ kind: 'compose' });
  });

  it('returns bare when no service payload', () => {
    expect(resolveInteractService({ npcName: 'Guard', npcCategory: 'shop' })).toEqual({
      kind: 'bare',
    });
  });

  it('priority shop > bank if both present (defense-in-depth)', () => {
    const s = resolveInteractService({
      npcName: 'X',
      shop: { rules: [{ itemId: 1, quantity: 1 }], open: 'dialog' },
      bank: { rules: [{ direction: 'deposit', target: 'gold', amount: 1 }] },
    });
    expect(s.kind).toBe('shop');
  });
});

describe('interactServiceCategory', () => {
  it('derives chip from payload', () => {
    expect(
      interactServiceCategory({
        npcName: 'S',
        shop: { rules: [{ itemId: 1, quantity: 1 }], open: 'dialog' },
      }),
    ).toBe('shop');
  });

  it('falls back to npcCategory for bare', () => {
    expect(interactServiceCategory({ npcName: 'G', npcCategory: 'unknown' })).toBe('unknown');
  });
});

describe('probeShopOpenOrder', () => {
  it('defaults to dialog then npc (capture SoT)', () => {
    expect(probeShopOpenOrder()).toEqual(['dialog', 'npc']);
    expect(probeShopOpenOrder('unknown')).toEqual(['dialog', 'npc']);
  });

  it('wire hint shop tries npc first (probe only)', () => {
    expect(probeShopOpenOrder('shop')).toEqual(['npc', 'dialog']);
  });
});
