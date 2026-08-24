import type { ViewItem, ViewItemEffect } from '@shared/types/item-types';
import {
  HUNT_SCROLL_CATALOG,
  type HuntScrollDestination,
} from '@shared/constants/hunt-scroll-catalog';
import { itemUseKind, type ItemUseKind } from '@shared/constants/item-use-kind';
import { MItemDefinition } from '@shared/constants/item-definitions';
import { HARDCODED_BONUS, TIME_BONUS } from './item-enrich';
import { getItem } from './item-db';

/**
 * Scroll data attached to a marshalled item. `kind` tells the host how to wire
 * `scroll.use` (a menu scroll needs a destination; a channel scroll does not); the
 * script never sees `kind` — only `destinations` plus the `use` method attached in
 * `buildScriptItemHandle`. Empty `destinations` is the channel-scroll signal.
 */
export interface MarshalledScroll {
  /** `'menu'` = hunt scroll (catalog destinations); `'channel'` = return/portal scroll (no destinations). */
  readonly kind: 'menu' | 'channel';
  /** Hunt spots in catalog order; empty for a channel scroll. */
  readonly destinations: readonly HuntScrollDestination[];
}

/** The item data `buildScriptItemHandle` projects into the script-visible QuickJS `Item`. */
export interface MarshalledItem {
  readonly slot: number;
  readonly bag?: number;
  readonly itemId: number;
  readonly name: string;
  readonly refineLevel?: number;
  readonly stackCount?: number;
  readonly immovable?: 1 | 2 | 3;
  /** Canonical right-click behavior class (`itemUseKind` — single source of truth). */
  readonly useKind: ItemUseKind;
  readonly scroll?: MarshalledScroll;
  readonly stats: MarshalledStat[];
}

export interface MarshalledStat {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

/**
 * Scroll payload for the `menu`/`channel` use-kinds: a menu scroll yields its
 * catalog destinations; a channel scroll (return/portal) yields an empty list.
 * Other kinds yield `undefined`.
 */
const scrollDataFor = (useKind: ItemUseKind, itemId: number): MarshalledScroll | undefined => {
  if (useKind === 'menu') {
    const destinations = HUNT_SCROLL_CATALOG.get(itemId);
    if (destinations) return { kind: 'menu', destinations };
  }
  if (useKind === 'channel') return { kind: 'channel', destinations: [] };
  return undefined;
};

/** Returns `null` for empty slots (`item.index === 0`) — matches the `null` convention of `ctx.player.equipment` / inventory `slots[]`. */
export const marshalViewItemToScript = (
  item: ViewItem | undefined,
  slot: number,
  bag?: number,
): MarshalledItem | null => {
  if (!item || item.index === 0) return null;
  const db = getItem(item.index);
  const useKind: ItemUseKind = db
    ? itemUseKind({ id: item.index, itemClass: db.itemClass, effectSlots: db.effectSlots })
    : 'equip';
  const scroll = scrollDataFor(useKind, item.index);
  return {
    slot,
    ...(bag !== undefined ? { bag } : {}),
    itemId: item.index,
    name: item.name,
    refineLevel: item.refineLevel,
    stackCount: item.stackCount,
    immovable: item.immovable,
    useKind,
    ...(scroll ? { scroll } : {}),
    stats: projectStats(item.effects),
  };
};

const STAT_KEY: Record<number, string> = {
  [MItemDefinition.LEVEL]: 'level',
  [MItemDefinition.DAMAGE]: 'damage',
  [MItemDefinition.AC1]: 'defense',
  [MItemDefinition.HP]: 'hp',
  [MItemDefinition.MP]: 'mp',
  [MItemDefinition.STR]: 'str',
  [MItemDefinition.INT]: 'int',
  [MItemDefinition.DEX]: 'dex',
  [MItemDefinition.CON]: 'con',
  [MItemDefinition.SPECIAL1]: 'special1',
  [MItemDefinition.SPECIAL2]: 'special2',
  [MItemDefinition.SPECIAL3]: 'special3',
  [MItemDefinition.SPECIAL4]: 'special4',
  [MItemDefinition.CLASS]: 'class',
  [MItemDefinition.REQ_STR]: 'reqStr',
  [MItemDefinition.REQ_INT]: 'reqInt',
  [MItemDefinition.REQ_DEX]: 'reqDex',
  [MItemDefinition.REQ_CON]: 'reqCon',
  [MItemDefinition.ATTSPEED]: 'attackSpeed',
  [MItemDefinition.MAGIC_CRIT]: 'magicCrit',
  [MItemDefinition.RUNSPEED]: 'moveSpeed',
  [MItemDefinition.EVASION]: 'evasion',
  [MItemDefinition.HITRATE]: 'hitRate',
  [MItemDefinition.CRITICAL]: 'critical',
  [MItemDefinition.SAVEMANA]: 'manaSaving',
  [MItemDefinition.HPADD]: 'hpBoost',
  [MItemDefinition.MPADD]: 'mpBoost',
  [MItemDefinition.REGENHP]: 'hpRegen',
  [MItemDefinition.REGENMP]: 'mpRegen',
  [MItemDefinition.RESIST1]: 'fireResist',
  [MItemDefinition.RESIST2]: 'iceResist',
  [MItemDefinition.RESIST3]: 'holyResist',
  [MItemDefinition.RESIST4]: 'lightningResist',
  [MItemDefinition.ACADD]: 'defenseBonus',
  [MItemDefinition.RESISTALL]: 'allResist',
  [MItemDefinition.PVPDAMAGE]: 'pvpAttack',
  [MItemDefinition.PVPAC]: 'pvpDefense',
  [MItemDefinition.MAGIC]: 'magicAttack',
  [MItemDefinition.INIT1]: 'init1',
  [MItemDefinition.INIT2]: 'init2',
  [MItemDefinition.INIT3]: 'init3',
  [MItemDefinition.DAMAGEADD]: 'damageAdd',
  [MItemDefinition.MAGICADD]: 'magicAdd',
  [MItemDefinition.DAMAGE2]: 'damage2',
  [MItemDefinition.SPECIALALL]: 'specialAll',
  [MItemDefinition.CURKILL]: 'penetration',
  [MItemDefinition.LTOTKILL]: 'critDamage',
  [MItemDefinition.HTOTKILL]: 'critReduction',
  [MItemDefinition.INCUBATE]: 'incubate',
  [MItemDefinition.MOUNTLIFE]: 'mountVitality',
  [MItemDefinition.MOUNTHP]: 'mountHp',
  [MItemDefinition.MOUNTSANC]: 'mountGrowth',
  [MItemDefinition.MOUNTFEED]: 'mountFeed',
  [MItemDefinition.MOUNTKILL]: 'mountExp',
  [MItemDefinition.INCUDELAY]: 'incubateDelay',
  [MItemDefinition.HP_REGEN_BONUS]: 'hpRegenBonus',
  [HARDCODED_BONUS.DEFENSE]: 'hardcodedDefense',
  [HARDCODED_BONUS.SKILL_DELAY]: 'skillDelay',
  [HARDCODED_BONUS.MAGIC_ATTACK]: 'hardcodedMagic',
  [HARDCODED_BONUS.DAMAGE_BOOST]: 'damageBoost',
  [HARDCODED_BONUS.PENETRATION]: 'penetrationBonus',
  [HARDCODED_BONUS.ABSORPTION]: 'absorption',
  [HARDCODED_BONUS.DROP_RATE]: 'dropRate',
  [HARDCODED_BONUS.EXPERIENCE]: 'experience',
  [TIME_BONUS.DURATION]: 'duration',
};

const projectStats = (effects: ViewItemEffect[] | undefined): MarshalledStat[] =>
  (effects ?? [])
    .filter((e) => !e.hidden && e.index !== 0)
    .map((e) => ({
      id: STAT_KEY[e.index] ?? 'effect_' + e.index,
      label: e.label,
      value: e.value,
    }));
