/**
 * Unit tests for `parseMissionitemsBin` and `buildComposeCatalog`.
 *
 * Missionitems.bin is the PanelMissionMix (window 0x1e) compose-menu source:
 * records of 0x1500, no header, record N at N*0x1500. Fields: +0x04 groupKey
 * (per-NPC root), +0x08 rowid, +0x0C parent/top-marker (-1=top), +0x10 child-rowid
 * array (the menu tree; `-1` ⇒ leaf recipe), +0x70 ingredient item ids (8 × 0xc),
 * +0xD0 result item, +0x1C0 typed cells (type 6 = ingredient qty).
 */
import { describe, it, expect } from 'vitest';
import { parseMissionitemsBin } from '../../../../src/main/game-assets/parsers/missionitems-bin';
import { buildComposeCatalog } from '../../../../src/main/game-assets/compose-catalog-builder';
import type {
  ComposeCategoryNode,
  ComposeRecipeNode,
} from '../../../../src/shared/types/compose-types';

const S = 0x1500;

/**
 * Synthetic Missionitems buffer. Mirrors the canonical: the tree is the `+0x10`
 * child-rowid array on the PARENT — not the `+0xC` back-pointer. Record 4 is a
 * child of category 2 ONLY via record 2's `+0x10` (its `+0xC` does NOT point at 2),
 * which is the exact case the old `+0xC`-nesting builder dropped.
 */
const buildBuf = (): Buffer => {
  const b = Buffer.alloc(S * 6);
  const i32 = (rec: number, off: number, v: number) => b.writeInt32LE(v, rec * S + off);
  const i16 = (rec: number, off: number, v: number) => b.writeInt16LE(v, rec * S + off);

  // record 1: top recipe — root 1, rowid 1, +0x10 == -1 (leaf), result 3203, ing 413 x5
  i32(1, 0x04, 1);
  i32(1, 0x08, 1);
  i32(1, 0x0c, -1);
  i32(1, 0x10, -1);
  i16(1, 0xd0, 3203);
  i16(1, 0x70, 413);
  i32(1, 0x1c0, 6); // cell type 6 (qty)
  i32(1, 0x1c4, 5); // qty 5

  // record 2: top category — root 2, rowid 2, +0x10 = [3, 4] (children), no result
  i32(2, 0x04, 2);
  i32(2, 0x08, 2);
  i32(2, 0x0c, -1);
  i32(2, 0x10, 3); // first child rowid
  i32(2, 0x14, 4); // second child rowid (terminator left at 0)

  // record 3: recipe child of 2 (via +0x10) — +0xC back-pointer set to 2, result 3200, ing 413 x1
  i32(3, 0x04, 2);
  i32(3, 0x08, 3);
  i32(3, 0x0c, 2);
  i32(3, 0x10, -1);
  i16(3, 0xd0, 3200);
  i16(3, 0x70, 413);
  i32(3, 0x1c0, 6);
  i32(3, 0x1c4, 1);

  // record 4: recipe child of 2 (via +0x10 ONLY) — +0xC is 0 (NOT 2), result 3201
  i32(4, 0x04, 2);
  i32(4, 0x08, 4);
  i32(4, 0x0c, 0); // no back-pointer to 2 → the old +0xC builder would miss this child
  i32(4, 0x10, -1);
  i16(4, 0xd0, 3201);

  return b;
};

describe('parseMissionitemsBin', () => {
  const recs = parseMissionitemsBin(buildBuf());

  it('parses a top recipe with rowid, root key, result, qty-paired ingredient and no children', () => {
    const r = recs.find((x) => x.index === 1)!;
    expect(r).toBeDefined();
    expect(r.rootKey).toBe(1);
    expect(r.parent).toBe(-1);
    expect(r.children).toEqual([]); // +0x10 == -1 ⇒ leaf
    expect(r.result).toBe(3203);
    expect(r.ingredients).toEqual([{ itemId: 413, qty: 5 }]);
  });

  it('reads the +0x10 child-rowid array (the menu tree) on a category', () => {
    const cat = recs.find((x) => x.index === 2)!;
    expect(cat.parent).toBe(-1);
    expect(cat.children).toEqual([3, 4]); // +0x10 forward links, terminated at 0
    const child = recs.find((x) => x.index === 3)!;
    expect(child.children).toEqual([]);
    expect(child.result).toBe(3200);
    expect(child.ingredients).toEqual([{ itemId: 413, qty: 1 }]);
  });

  it('skips fully empty records', () => {
    expect(recs.map((r) => r.index).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });
});

describe('buildComposeCatalog', () => {
  const recipes = parseMissionitemsBin(buildBuf());
  // Missionhelp labels (keyed by rowid): record 2 is a category named here.
  // No item-name lookup — names are resolved in the renderer via item-db.
  const help = new Map<number, string>([[2, 'Forja Ancestral']]);
  const catalog = buildComposeCatalog({ recipes, nodeName: (rowid) => help.get(rowid) });
  const groups = catalog.root.children as ComposeCategoryNode[];

  it('groups top rows (parent === -1) by per-NPC root key and tags each group with rootKey', () => {
    expect(catalog.root.label).toBe('Composição');
    // record 4 (parent 0) is NOT a top row → only roots 1 and 2 exist.
    expect(groups.map((g) => g.rootKey).sort()).toEqual([1, 2]);
  });

  it('carries a recipe leaf as raw ids (no baked name) for renderer item-db resolution', () => {
    const g1 = groups.find((g) => g.rootKey === 1)!;
    const leaf = g1.children[0] as ComposeRecipeNode;
    expect(leaf.kind).toBe('recipe');
    expect(leaf.label).toBeUndefined(); // no missionhelp → renderer names it by result via item-db
    expect(leaf.index).toBe(1);
    expect(leaf.result).toBe(3203);
    expect(leaf.ingredients).toEqual([{ itemId: 413, qty: 5 }]); // ids only, no name
  });

  it('nests children via the +0x10 array — INCLUDING one with no +0xC back-pointer (the bug)', () => {
    const g2 = groups.find((g) => g.rootKey === 2)!;
    const cat = g2.children[0] as ComposeCategoryNode;
    expect(cat.kind).toBe('category');
    expect(cat.label).toBe('Forja Ancestral'); // missionhelp[2]
    expect(cat.fallbackItemId).toBe(3200); // first child's result (renderer names it via item-db)
    // BOTH children appear, in +0x10 order — record 4 is linked only by +0x10.
    expect(cat.children.map((c) => (c as ComposeRecipeNode).index)).toEqual([3, 4]);
    expect((cat.children[1] as ComposeRecipeNode).result).toBe(3201);
  });
});
