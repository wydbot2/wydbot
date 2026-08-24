/**
 * Builds the navigable composition catalog (pure, no I/O) from parsed Missionitems
 * records + a `rowid → label` lookup (Missionhelp.dat). Nodes carry item IDs + menu
 * labels only; item names are resolved in the renderer via the item-db.
 *
 * A node's children are the rowids in its `+0x10` array (`MissionRecipe.children`);
 * top rows (`parent === -1`) are grouped by `rootKey` (the per-NPC selector). The
 * wire submit (`0x2e7`) sends a node's `index`.
 */

import type {
  ComposeCatalog,
  ComposeCategoryNode,
  ComposeMenuNode,
  ComposeRecipeNode,
  MissionRecipe,
} from '@shared/types/compose-types';

export interface ComposeCatalogInput {
  recipes: readonly MissionRecipe[];
  /** rowid → menu label (from Missionhelp.dat). */
  nodeName: (rowid: number) => string | undefined;
}

const REAL_ITEM_MAX = 0x1963;
const isRealItem = (id: number): boolean => id >= 100 && id <= REAL_ITEM_MAX;

export const buildComposeCatalog = (input: ComposeCatalogInput): ComposeCatalog => {
  const { recipes, nodeName } = input;

  // rowid → record; children are walked via each node's +0x10 array (r.children).
  const byRowid = new Map<number, MissionRecipe>();
  for (const r of recipes) if (!byRowid.has(r.index)) byRowid.set(r.index, r);

  // Resolve a node's child records (preserve `+0x10` order; drop unknown rowids).
  const childRecordsOf = (r: MissionRecipe): MissionRecipe[] => {
    const out: MissionRecipe[] = [];
    for (const id of r.children) {
      const child = byRowid.get(id);
      if (child) out.push(child);
    }
    return out;
  };

  const labelOf = (r: MissionRecipe): string | undefined => nodeName(r.index)?.trim() || undefined;

  // Representative item id for a label-less category: result, else a child's result, else first ingredient.
  const fallbackItemIdOf = (r: MissionRecipe): number | undefined => {
    if (isRealItem(r.result)) return r.result;
    for (const k of childRecordsOf(r)) {
      if (isRealItem(k.result)) return k.result;
    }
    const firstIng = r.ingredients.find((i) => isRealItem(i.itemId));
    return firstIng?.itemId;
  };

  // Per-path cycle guard for the child DAG (shared leaves appear under several parents).
  const buildNode = (r: MissionRecipe, seen: Set<number>): ComposeMenuNode => {
    const kids = childRecordsOf(r).filter((k) => !seen.has(k.index));
    if (kids.length > 0) {
      const next = new Set(seen).add(r.index);
      const cat: ComposeCategoryNode = {
        kind: 'category',
        label: labelOf(r),
        fallbackItemId: fallbackItemIdOf(r),
        children: kids.map((k) => buildNode(k, next)),
      };
      return cat;
    }
    const recipe: ComposeRecipeNode = {
      kind: 'recipe',
      index: r.index,
      label: labelOf(r),
      result: r.result,
      ingredients: r.ingredients,
      goldCost: 0,
    };
    return recipe;
  };

  // Top-level rows (parent === -1) grouped by their per-NPC root key (entity+0x750).
  const byRoot = new Map<number, MissionRecipe[]>();
  for (const t of recipes) {
    if (t.parent !== -1) continue;
    const bucket = byRoot.get(t.rootKey);
    if (bucket) bucket.push(t);
    else byRoot.set(t.rootKey, [t]);
  }

  const children: ComposeMenuNode[] = [...byRoot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rootKey, rows]) => {
      const seen = new Set<number>();
      return {
        kind: 'category' as const,
        rootKey,
        label: `Combinação ${rootKey}`,
        children: rows.map((row) => buildNode(row, seen)),
      };
    });

  const recipeCount = recipes.filter((r) => isRealItem(r.result) || nodeName(r.index)).length;
  return { root: { kind: 'category', label: 'Composição', children }, recipeCount };
};
