/**
 * Unit tests for unified scroll + useKind enrichment in `marshalViewItemToScript`.
 *
 * The marshal delegates ALL classification to `itemUseKind` (item-use-kind.ts):
 * - menu scroll (cat 0xc3 + catalog) → `scroll` with kind 'menu' + catalog destinations
 * - channel scroll (cat 0xb/0xd) → `scroll` with kind 'channel' + empty destinations
 * - direct consumable → useKind 'direct', no `scroll` (host attaches `item.use()`)
 * Normal items carry no `scroll` (its absence is the script-side guard). The `use`
 * method itself is added later in `buildScriptItemHandle` (QuickJS host fn).
 */
import { describe, it, expect, vi } from 'vitest';

// Deterministic item-db: 410 = channel (0xb); hunt = 0xc3; 784 = direct (0x1c);
// 4112 = territory ticket (0xbc); else normal. itemClass 0 everywhere.
vi.mock('../../../../src/renderer/lib/item-db', () => ({
  getItem: (id: number) => {
    if (id === 410) return { itemClass: 0, effectSlots: [{ idx: 0x26, value: 0xb }] };
    if (id >= 0xd68 && id <= 0xd6d)
      return { itemClass: 0, effectSlots: [{ idx: 0x26, value: 0xc3 }] };
    if (id === 0xdb4) return { itemClass: 0, effectSlots: [{ idx: 0x26, value: 0xc3 }] }; // unnamed edge (no catalog block)
    if (id === 784) return { itemClass: 0, effectSlots: [{ idx: 0x26, value: 0x1c }] };
    if (id === 4111 || id === 4112 || id === 4113)
      return { itemClass: 0, effectSlots: [{ idx: 0x26, value: 0xbc }] };
    return { itemClass: 0, effectSlots: [{ idx: 0x26, value: 0x10 }] }; // normal item (VOLATILE grade)
  },
}));

import { marshalViewItemToScript } from '../../../../src/renderer/lib/script-item-marshal';
import type { ViewItem } from '../../../../src/shared/types/item-types';

const view = (index: number, name = 'x'): ViewItem => ({ index, name }) as unknown as ViewItem;

describe('marshalViewItemToScript — unified scroll + useKind enrichment', () => {
  it('attaches scroll kind "menu" with catalog destinations (Kefra, 0xd6c)', () => {
    const item = marshalViewItemToScript(view(0xd6c, 'Pedido de Caça(Kefra)'), 8, 0);
    expect(item).not.toBeNull();
    expect(item!.useKind).toBe('menu');
    expect(item!.scroll).toBeDefined();
    expect(item!.scroll!.kind).toBe('menu');
    expect(item!.scroll!.destinations).toHaveLength(10);
    expect(item!.scroll!.destinations[8]).toMatchObject({ x: 2269, y: 3910 });
  });

  it('attaches scroll kind "channel" with EMPTY destinations (Pergaminho Retorno, 410)', () => {
    const item = marshalViewItemToScript(view(410, 'Pergaminho Retorno'), 1, 0);
    expect(item).not.toBeNull();
    expect(item!.useKind).toBe('channel');
    expect(item!.scroll).toBeDefined();
    expect(item!.scroll!.kind).toBe('channel');
    expect(item!.scroll!.destinations).toEqual([]);
  });

  it('does NOT attach scroll to a normal item (useKind equip)', () => {
    const item = marshalViewItemToScript(view(709, 'Poção'), 3, 1);
    expect(item).not.toBeNull();
    expect(item!.scroll).toBeUndefined();
    expect(item!.useKind).toBe('equip');
  });

  it('does NOT attach scroll to the unnamed 0xdb4 edge (catalog gate)', () => {
    const item = marshalViewItemToScript(view(0xdb4), 0, 0);
    expect(item!.scroll).toBeUndefined();
    expect(item!.useKind).toBe('equip');
  });

  it('classifies direct consumables (water scroll 784, ticket 4112), without scroll', () => {
    const water = marshalViewItemToScript(view(784, 'Pergaminho da Água(M)LV8'), 5, 0);
    expect(water!.useKind).toBe('direct');
    expect(water!.scroll).toBeUndefined();

    const ticket = marshalViewItemToScript(view(4112, 'Entrada do Território(M)'), 2, 0);
    expect(ticket!.useKind).toBe('direct');
    expect(ticket!.scroll).toBeUndefined();
  });

  it('channel scrolls are never direct', () => {
    const item = marshalViewItemToScript(view(410, 'Pergaminho Retorno'), 1, 0);
    expect(item!.useKind).toBe('channel');
    expect(item!.scroll?.kind).toBe('channel');
  });

  it('returns null for an empty slot', () => {
    expect(marshalViewItemToScript({ index: 0 } as unknown as ViewItem, 0, 0)).toBeNull();
  });
});
