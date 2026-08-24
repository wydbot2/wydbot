/**
 * Pure, lock-aware inventory introspection over the flat 60-slot array
 * (`bag * 15 + slot`). Locked ("locker") bags — those the character hasn't
 * unlocked (`bagUnlock`) — are treated as UNUSABLE: their slots never count as
 * free and items inside them are skipped (you can't act on them anyway).
 *
 * Mirrors `macro-auto-stack.ts`'s `isUsableSlot`. Backs the macro Script API
 * (`ctx.player.inventory`); kept pure (no store/QuickJS) so it is unit-testable.
 */
import type { ViewItem } from '@shared/types/item-types';
import { MAXL_INVENTORY } from '@shared/constants/game-basics';
import { BAG_SIZE, isBagLocked } from '../components/game/personagem/character-tables';

type Slots = readonly (ViewItem | undefined)[];

const isUsable = (globalSlot: number, bagUnlock: readonly boolean[]): boolean =>
  !isBagLocked(Math.floor(globalSlot / BAG_SIZE), bagUnlock);

const filled = (item: ViewItem | undefined): item is ViewItem => !!item && item.index !== 0;

/** Empty slots across UNLOCKED bags only (locked-bag slots never count). */
export const countFreeSlots = (inventory: Slots, bagUnlock: readonly boolean[]): number => {
  let free = 0;
  for (let i = 0; i < MAXL_INVENTORY; i++) {
    if (isUsable(i, bagUnlock) && !filled(inventory[i])) free++;
  }
  return free;
};

/** `true` when no usable (unlocked) slot is empty. */
export const isInventoryFull = (inventory: Slots, bagUnlock: readonly boolean[]): boolean =>
  countFreeSlots(inventory, bagUnlock) === 0;

/** Total quantity of `itemId` across unlocked bags (stacks counted by size). */
export const countItem = (
  inventory: Slots,
  bagUnlock: readonly boolean[],
  itemId: number,
): number => {
  let total = 0;
  for (let i = 0; i < MAXL_INVENTORY; i++) {
    const v = inventory[i];
    if (isUsable(i, bagUnlock) && filled(v) && v.index === itemId) total += v.stackCount ?? 1;
  }
  return total;
};

export interface InventoryEntry {
  readonly item: ViewItem;
  /** Slot within the bag (0..14). */
  readonly slot: number;
  /** Bag index (0..3). */
  readonly bag: number;
}

/** First `itemId` across unlocked bags (bag order), or `null`. */
export const findItemEntry = (
  inventory: Slots,
  bagUnlock: readonly boolean[],
  itemId: number,
): InventoryEntry | null => {
  for (let i = 0; i < MAXL_INVENTORY; i++) {
    const v = inventory[i];
    if (isUsable(i, bagUnlock) && filled(v) && v.index === itemId) {
      return { item: v, slot: i % BAG_SIZE, bag: Math.floor(i / BAG_SIZE) };
    }
  }
  return null;
};

/** `true` if at least one `itemId` exists in an unlocked bag. */
export const hasItem = (inventory: Slots, bagUnlock: readonly boolean[], itemId: number): boolean =>
  findItemEntry(inventory, bagUnlock, itemId) !== null;
