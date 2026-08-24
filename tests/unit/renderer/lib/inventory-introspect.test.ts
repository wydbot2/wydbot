/**
 * Unit tests for lock-aware inventory introspection (src/renderer/lib/inventory-introspect.ts).
 *
 * Locked ("locker") bags are the last two (bags 2 & 3; `bagUnlock[0]`↔bag2, `[1]`↔bag3);
 * bags 0 & 1 never lock. A locked bag's slots must NOT count as free, and its items must
 * be skipped by count/find/has. Mirrors `macro-auto-stack`'s usable-slot rule.
 */
import { describe, it, expect } from 'vitest';
import type { ViewItem } from '../../../../src/shared/types/item-types';
import {
  countFreeSlots,
  isInventoryFull,
  countItem,
  findItemEntry,
  hasItem,
} from '../../../../src/renderer/lib/inventory-introspect';

const FREE = { index: 0 } as unknown as ViewItem;
const ITEM = (id: number, stack?: number): ViewItem =>
  ({
    index: id,
    name: 'x',
    ...(stack !== undefined ? { stackCount: stack } : {}),
  }) as unknown as ViewItem;

/** 60-slot inventory: `fill(globalSlot)` decides each slot. */
const inv = (fill: (i: number) => ViewItem): ViewItem[] =>
  Array.from({ length: 60 }, (_, i) => fill(i));

const ALL_UNLOCKED = [true, true];
const ALL_LOCKED = [false, false]; // bags 2 & 3 locked; bags 0 & 1 never lock

describe('inventory-introspect — lock-aware', () => {
  it('freeSlots/isFull ignore locked bags', () => {
    // bags 0-1 (slots 0..29) full; bags 2-3 (30..59) empty
    const inventory = inv((i) => (i < 30 ? ITEM(100) : FREE));
    // all unlocked → 30 free (bags 2-3), not full
    expect(countFreeSlots(inventory, ALL_UNLOCKED)).toBe(30);
    expect(isInventoryFull(inventory, ALL_UNLOCKED)).toBe(false);
    // bags 2-3 locked → their 30 empty slots don't count → full
    expect(countFreeSlots(inventory, ALL_LOCKED)).toBe(0);
    expect(isInventoryFull(inventory, ALL_LOCKED)).toBe(true);
  });

  it('one free slot in an unlocked bag → not full', () => {
    const inventory = inv((i) => (i < 30 && i !== 5 ? ITEM(100) : FREE));
    expect(countFreeSlots(inventory, ALL_LOCKED)).toBe(1);
    expect(isInventoryFull(inventory, ALL_LOCKED)).toBe(false);
  });

  it('count/find/has skip items in a locked bag, but see them once unlocked', () => {
    // item 709 only at slot 30 (bag 2, slot 0)
    const inventory = inv((i) => (i === 30 ? ITEM(709, 5) : FREE));
    expect(countItem(inventory, ALL_LOCKED, 709)).toBe(0);
    expect(findItemEntry(inventory, ALL_LOCKED, 709)).toBeNull();
    expect(hasItem(inventory, ALL_LOCKED, 709)).toBe(false);
    // unlock bag 2 (bagUnlock[0] = true)
    expect(countItem(inventory, [true, false], 709)).toBe(5);
    expect(findItemEntry(inventory, [true, false], 709)).toMatchObject({ slot: 0, bag: 2 });
    expect(hasItem(inventory, [true, false], 709)).toBe(true);
  });

  it('count sums stacks across unlocked bags', () => {
    const inventory = inv((i) => (i === 0 ? ITEM(709, 10) : i === 16 ? ITEM(709, 3) : FREE));
    expect(countItem(inventory, ALL_UNLOCKED, 709)).toBe(13); // bag0 slot0 + bag1 slot1
  });

  it('treats a short/empty inventory array as empty (undefined slots)', () => {
    expect(countFreeSlots([], ALL_UNLOCKED)).toBe(60);
    expect(countFreeSlots([], ALL_LOCKED)).toBe(30); // only bags 0 & 1 usable
    expect(isInventoryFull([], ALL_UNLOCKED)).toBe(false);
  });
});
