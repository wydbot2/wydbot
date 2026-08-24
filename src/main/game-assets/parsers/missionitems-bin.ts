/**
 * Parser for `Missionitems.bin` — the composition recipe table behind the
 * PanelMissionMix NPC menu (window 0x1e). Flat, no header; record N at N*0x1500.
 *
 * Record layout (stride `0x1500`, LE; offset from record base):
 *   +0x04 u32 groupKey  — per-NPC root selector (entity+0x750); top rows match it.
 *   +0x08 u32 rowid     — recipe id (sent on C2S `0x2e7`); also the record index.
 *   +0x0C i32 parent    — `-1` ⇒ top-level row (back-pointer, not the tree link).
 *   +0x10 u32[24] children — child rowids (terminated by `<= 0`); empty ⇒ leaf recipe.
 *   +0x70 ingredient item ids — 8 × `0x0C` (id is the leading u16).
 *   +0xD0 u16 result    — produced item id (`0` ⇒ a category/conversion node).
 *   +0x1C0 typed cells  — 8×20 × `0x18` (type@+0, val@+4); type 6 = ingredient qty.
 */

import type { MissionRecipe, ComposeIngredient } from '@shared/types/compose-types';

const RECORD_SIZE = 0x1500;
const TOP_PARENT = -1;
const CHILD_BASE = 0x10; // child-rowid array (the menu tree)
const CHILD_MAX = 24; // reader copies 0x18 u32 entries (0x60 bytes)
const ITEM_SLOTS = 8;
const ITEM_SLOT_STRIDE = 0xc;
const CELL_BASE = 0x1c0;
const CELL_STRIDE = 0x18;
const CELL_SCAN = 24; // enough to cover one group's quantity cells
const CELL_TYPE_QTY = 6;

const ITEM_ID_MIN = 100;
const ITEM_ID_MAX = 0x1963; // 6499
const isItemId = (v: number): boolean => v >= ITEM_ID_MIN && v <= ITEM_ID_MAX;

export interface MissionitemsParseStats {
  recordsScanned: number;
  recipes: number;
}

/** Parse `Missionitems.bin` into raw recipe/category records (the builder assembles the tree). */
export const parseMissionitemsBin = (
  buffer: Buffer,
  stats?: MissionitemsParseStats,
): MissionRecipe[] => {
  const out: MissionRecipe[] = [];
  if (stats) {
    stats.recordsScanned = 0;
    stats.recipes = 0;
  }
  const i32 = (off: number): number => (off + 4 <= buffer.length ? buffer.readInt32LE(off) : 0);
  const i16 = (off: number): number => (off + 2 <= buffer.length ? buffer.readInt16LE(off) : 0);

  const count = Math.floor(buffer.length / RECORD_SIZE);
  for (let r = 0; r < count; r++) {
    const o = r * RECORD_SIZE;
    if (stats) stats.recordsScanned++;

    const groupKey = i32(o + 0x04);
    const rowid = i32(o + 0x08);
    const parent = i32(o + 0x0c);
    const result = i16(o + 0xd0);

    // child rowids (+0x10): the menu tree. Non-empty ⇒ category; `+0x10 == -1` ⇒ recipe.
    const children: number[] = [];
    for (let k = 0; k < CHILD_MAX; k++) {
      const childId = i32(o + CHILD_BASE + k * 4);
      if (childId <= 0) break; // -1 (recipe) or 0 (array terminator)
      children.push(childId);
    }

    // ingredient item ids (+0x70), paired in order with type-6 quantity cells (+0x1C0)
    const itemIds: number[] = [];
    for (let k = 0; k < ITEM_SLOTS; k++) {
      const id = i16(o + 0x70 + k * ITEM_SLOT_STRIDE);
      if (isItemId(id)) itemIds.push(id);
    }
    const qtys: number[] = [];
    for (let k = 0; k < CELL_SCAN; k++) {
      const c = o + CELL_BASE + k * CELL_STRIDE;
      if (i32(c) === CELL_TYPE_QTY) qtys.push(i32(c + 4));
    }
    const ingredients: ComposeIngredient[] = itemIds.map((itemId, idx) => ({
      itemId,
      qty: qtys[idx] && qtys[idx] > 0 ? qtys[idx]! : 1,
    }));

    // Skip fully empty slots (no tree position, no children, no result, no ingredients).
    const isTop = parent === TOP_PARENT;
    if (rowid === 0 && !isTop && children.length === 0 && result === 0 && ingredients.length === 0)
      continue;

    out.push({ index: rowid, rootKey: groupKey, parent, children, result, ingredients });
    if (stats && (result !== 0 || ingredients.length > 0)) stats.recipes++;
  }
  return out;
};
