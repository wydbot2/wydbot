/**
 * Unit tests for `pickHealingAction` — variant A ladder over `actions: HealAction[]`.
 *
 * Resolution order:
 *   1. First skill action with elapsed CDR wins.
 *   2. Else first item action with elapsed bucket cooldown AND present in inventory wins.
 *   3. Else null.
 */

import { describe, it, expect } from 'vitest';
import { pickHealingAction } from '../../../../src/renderer/lib/healing-pick-action';
import type { ItemDb, Item } from '../../../../src/shared/types/item-db-types';
import type { Skill, SkillRow } from '../../../../src/shared/types/skill-types';
import type { ViewItem } from '../../../../src/shared/types/item-types';
import type { HealAction } from '../../../../src/shared/app-config/v1/sections/auto-healing';

// --- Test fixtures ---------------------------------------------------------

const makeSkill = (id: number, cooldownSecs: number): Skill => ({
  id,
  name: `skill-${id}`,
  iconUrl: null,
  row: { id, cooldownSecs } as unknown as SkillRow,
});

const makeItem = (id: number, category: number): Item =>
  ({
    id,
    name: `item-${id}`,
    equipModelId: 0,
    level: 0,
    skillbar: 0,
    effectSlots: [{ idx: 0x26, value: category }],
    mesh: 0,
    pos: 0,
    grade: 0,
    itemClass: 0,
    mountIndex: 0,
    maxStack: 0,
    hasIcon: false,
  }) as Item;

const makeItemDb = (skills: Skill[], items: Item[]): ItemDb => ({
  items: new Map(items.map((it) => [it.id, it])),
  skillsById: new Map(skills.map((s) => [s.id, s])),
  meta: {
    itemCount: items.length,
    namedCount: 0,
    helpCount: 0,
    extraItemOverlayCount: 0,
    mountDataCount: 0,
    mountDataVCount: 0,
    skillViewCount: skills.length,
    loadedAtMs: 0,
  },
});

const emptyViewItem = (index = 0): ViewItem => ({ index, name: '', displayName: '', effects: [] });

const slotInBag = (id: number, slot = 5): readonly ViewItem[] => {
  const inv: ViewItem[] = Array.from({ length: 60 }, () => emptyViewItem());
  inv[slot] = emptyViewItem(id);
  return inv;
};

const emptyBag = (): readonly ViewItem[] => Array.from({ length: 60 }, () => emptyViewItem());

const HP_POT_CAT = 0x01;
const HERB_CAT = 0xf3;
const NOW = 1_000_000;

// --- Tests -----------------------------------------------------------------

describe('pickHealingAction — actions[] ladder', () => {
  it('(a) one skill ready + one item ready → skill (priority)', () => {
    const itemDb = makeItemDb([makeSkill(0x1b, 5)], [makeItem(2001, HP_POT_CAT)]);
    const actions: HealAction[] = [
      { kind: 'skill', refId: 0x1b },
      { kind: 'item', refId: 2001 },
    ];
    expect(
      pickHealingAction({
        actions,
        inventory: slotInBag(2001),
        itemDb,
        now: NOW,
        lastSkillCastAt: NOW - 10_000,
        lastItemUseAt: NOW - 10_000,
      }),
    ).toEqual({ kind: 'skill', skillId: 0x1b });
  });

  it('(b) skill on CDR + item ready → item fallback', () => {
    const itemDb = makeItemDb([makeSkill(0x1b, 5)], [makeItem(2001, HP_POT_CAT)]);
    const actions: HealAction[] = [
      { kind: 'skill', refId: 0x1b },
      { kind: 'item', refId: 2001 },
    ];
    expect(
      pickHealingAction({
        actions,
        inventory: slotInBag(2001, 7),
        itemDb,
        now: NOW,
        lastSkillCastAt: NOW - 2_000,
        lastItemUseAt: NOW - 1_000,
      }),
    ).toEqual({ kind: 'item', slot: 7, itemId: 2001, feedMarker: 0 });
  });

  it('(c) both on CDR → null', () => {
    const itemDb = makeItemDb([makeSkill(0x1b, 5)], [makeItem(2001, HP_POT_CAT)]);
    const actions: HealAction[] = [
      { kind: 'skill', refId: 0x1b },
      { kind: 'item', refId: 2001 },
    ];
    expect(
      pickHealingAction({
        actions,
        inventory: slotInBag(2001),
        itemDb,
        now: NOW,
        lastSkillCastAt: NOW - 1_000,
        lastItemUseAt: NOW - 100,
      }),
    ).toBeNull();
  });

  it('(d) only skill configured + on CDR → null (no item fallback)', () => {
    const itemDb = makeItemDb([makeSkill(0x1b, 5)], []);
    expect(
      pickHealingAction({
        actions: [{ kind: 'skill', refId: 0x1b }],
        inventory: emptyBag(),
        itemDb,
        now: NOW,
        lastSkillCastAt: NOW - 1_000,
        lastItemUseAt: 0,
      }),
    ).toBeNull();
  });

  it('(e) item configured but NOT in inventory → null', () => {
    const itemDb = makeItemDb([], [makeItem(2001, HP_POT_CAT)]);
    expect(
      pickHealingAction({
        actions: [{ kind: 'item', refId: 2001 }],
        inventory: emptyBag(),
        itemDb,
        now: NOW,
        lastSkillCastAt: 0,
        lastItemUseAt: 0,
      }),
    ).toBeNull();
  });

  it('empty actions[] → null', () => {
    expect(
      pickHealingAction({
        actions: [],
        inventory: emptyBag(),
        itemDb: makeItemDb([], []),
        now: NOW,
        lastSkillCastAt: 0,
        lastItemUseAt: 0,
      }),
    ).toBeNull();
  });
});

describe('pickHealingAction — multi-action fallback', () => {
  it('skill A in CDR + skill B ready → skill B', () => {
    const itemDb = makeItemDb([makeSkill(0x1b, 5), makeSkill(0x1d, 1)], []);
    expect(
      pickHealingAction({
        actions: [
          { kind: 'skill', refId: 0x1b },
          { kind: 'skill', refId: 0x1d },
        ],
        inventory: emptyBag(),
        itemDb,
        now: NOW,
        lastSkillCastAt: NOW - 2_000, // 0x1b needs 5s, 0x1d needs 1s — both share same lastCast
        lastItemUseAt: 0,
      }),
    ).toEqual({ kind: 'skill', skillId: 0x1d });
  });

  it('item A not in bag + item B in bag → item B', () => {
    const itemDb = makeItemDb([], [makeItem(2001, HP_POT_CAT), makeItem(2002, HP_POT_CAT)]);
    expect(
      pickHealingAction({
        actions: [
          { kind: 'item', refId: 2001 },
          { kind: 'item', refId: 2002 },
        ],
        inventory: slotInBag(2002, 9),
        itemDb,
        now: NOW,
        lastSkillCastAt: 0,
        lastItemUseAt: NOW - 1_000,
      }),
    ).toEqual({ kind: 'item', slot: 9, itemId: 2002, feedMarker: 0 });
  });

  it('skills scanned FIRST regardless of order — skill at index 2 wins over item at index 0', () => {
    const itemDb = makeItemDb([makeSkill(0x1b, 5)], [makeItem(2001, HP_POT_CAT)]);
    expect(
      pickHealingAction({
        actions: [
          { kind: 'item', refId: 2001 }, // first in array, but items scanned second
          { kind: 'item', refId: 2002 },
          { kind: 'skill', refId: 0x1b },
        ],
        inventory: slotInBag(2001),
        itemDb,
        now: NOW,
        lastSkillCastAt: NOW - 10_000,
        lastItemUseAt: NOW - 10_000,
      }),
    ).toEqual({ kind: 'skill', skillId: 0x1b });
  });
});

describe('pickHealingAction — bucket cooldown by item category', () => {
  it('herb (cat 0xF3) blocked < 300ms', () => {
    const itemDb = makeItemDb([], [makeItem(415, HERB_CAT)]);
    expect(
      pickHealingAction({
        actions: [{ kind: 'item', refId: 415 }],
        inventory: slotInBag(415),
        itemDb,
        now: NOW,
        lastSkillCastAt: 0,
        lastItemUseAt: NOW - 250,
      }),
    ).toBeNull();
  });

  it('herb (cat 0xF3) ready after 300ms', () => {
    const itemDb = makeItemDb([], [makeItem(415, HERB_CAT)]);
    expect(
      pickHealingAction({
        actions: [{ kind: 'item', refId: 415 }],
        inventory: slotInBag(415, 12),
        itemDb,
        now: NOW,
        lastSkillCastAt: 0,
        lastItemUseAt: NOW - 300,
      }),
    ).toEqual({ kind: 'item', slot: 12, itemId: 415, feedMarker: 0 });
  });

  it('feedMarker forwarded for mount feed (0xE)', () => {
    const itemDb = makeItemDb([], [makeItem(0x974, 0x0f)]);
    expect(
      pickHealingAction({
        actions: [{ kind: 'item', refId: 0x974 }],
        inventory: slotInBag(0x974, 3),
        itemDb,
        now: NOW,
        lastSkillCastAt: 0,
        lastItemUseAt: NOW - 1_000,
        itemFeedMarker: 0xe,
      }),
    ).toEqual({ kind: 'item', slot: 3, itemId: 0x974, feedMarker: 0xe });
  });
});
