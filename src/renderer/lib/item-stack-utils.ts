import { getItem } from './item-db';

/**
 * Canonical "manually stackable / splittable" predicate, mirroring the client's
 * separar?" gate): an item is manually stackable iff its ItemList row's
 * `itemClass` ∈ {0x36, 0x3D} **or** `maxStack` (+0x9E) ≠ 0. Returns the per-item
 * the item is NOT manually stackable (e.g. heal/MP potions — server-stacked,
 * maxStack=0). See
 * §"Manually-stackable predicate (the split-dialog oracle)".
 */
export const stackCapOf = (itemId: number): number => {
  const db = getItem(itemId);
  if (!db) return 0;
  if (db.itemClass === 0x36 || db.itemClass === 0x3d) return 100;
  return db.maxStack !== 0 ? db.maxStack : 0;
};
