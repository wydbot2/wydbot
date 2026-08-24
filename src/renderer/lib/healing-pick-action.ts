/**
 * Pure ladder helper for the Auto Healing ambient modules.
 *
 * Given a list of fallback actions (skills OR items, ordered) and live runtime
 * state (inventory, cooldown timestamps, ItemDb), returns the first ready
 * action — or `null` if nothing fires.
 *
 * **Resolution order** (mirrors v1 priority rule, generalized to N actions):
 *   1. **Skills first** — scan `actions[]` in order; first `kind: 'skill'` whose
 *      CDR has elapsed wins.
 *   2. **Items fallback** — if no skill ready, scan `actions[]` again; first
 *      `kind: 'item'` whose per-category bucket cooldown has elapsed AND that
 *      is present in inventory wins.
 *   3. Else `null`.
 *
 * Cooldown windows mirror the game's per-category buckets: bucket 0 = 250 ms (cat 1, HP pot),
 * bucket 1 = 500 ms (cat 0xF, mount feed — handled by auto-feed module),
 * bucket 2 = 300 ms (default / MP), bucket 3 = 300 ms (cat 0xF2/0xF3 herb).
 */

import type { ItemDb, Item } from '@shared/types/item-db-types';
import type { ViewItem } from '@shared/types/item-types';
import type { HealAction } from '@shared/app-config/v1/sections/auto-healing';

export type PickedAction =
  | { readonly kind: 'skill'; readonly skillId: number }
  | {
      readonly kind: 'item';
      readonly slot: number;
      readonly itemId: number;
      readonly feedMarker: 0 | 0xe;
    };

export interface PickHealingActionInput {
  /** Ordered fallback list — see resolution order in module header. */
  readonly actions: readonly HealAction[];
  readonly inventory: readonly ViewItem[];
  readonly itemDb: ItemDb;
  readonly now: number;
  /** Last cast timestamp of ANY skill from this rule's actions (shared bucket). */
  readonly lastSkillCastAt: number;
  /** Last use timestamp of ANY item from this rule's actions (shared bucket). */
  readonly lastItemUseAt: number;
  /** `0` (potion/herb) or `0xE` (mount feed). Default `0`. */
  readonly itemFeedMarker?: 0 | 0xe;
}

const ITEM_BUCKET_COOLDOWNS_MS = [250, 500, 300, 300, 0] as const;

const bucketForCategory = (category: number): number => {
  if (category === 0x01) return 0;
  if (category === 0x0f) return 1;
  if (category === 0xf2 || category === 0xf3) return 3;
  if (category === 0xb8) return 4;
  return 2;
};

const itemCategory = (item: Item): number => {
  for (const slot of item.effectSlots) {
    if (slot.idx === 0x26) return slot.value;
  }
  return 0;
};

export const pickHealingAction = (input: PickHealingActionInput): PickedAction | null => {
  // 1. Skill ladder — first off-CDR skill in actions[] wins.
  for (const action of input.actions) {
    if (action.kind !== 'skill') continue;
    const skill = input.itemDb.skillsById.get(action.refId);
    if (!skill) continue;
    const cdMs = skill.row.cooldownSecs * 1000;
    if (input.now - input.lastSkillCastAt >= cdMs) {
      return { kind: 'skill', skillId: action.refId };
    }
  }

  // 2. Item fallback — first off-CDR item PRESENT in inventory wins.
  const feedMarker = input.itemFeedMarker ?? 0;
  for (const action of input.actions) {
    if (action.kind !== 'item') continue;
    const itemDef = input.itemDb.items.get(action.refId);
    if (!itemDef) continue;

    const bucket = bucketForCategory(itemCategory(itemDef));
    const cdMs = ITEM_BUCKET_COOLDOWNS_MS[bucket] ?? 300;
    if (input.now - input.lastItemUseAt < cdMs) continue;

    const slot = input.inventory.findIndex((it) => it?.index === action.refId);
    if (slot < 0) continue;

    return { kind: 'item', slot, itemId: action.refId, feedMarker };
  }

  return null;
};
