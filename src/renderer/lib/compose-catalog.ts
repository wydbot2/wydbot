/**
 * Renderer-side access to the composition (Item-Mix) recipe catalog.
 *
 * Mirrors `item-db.ts`: lazy-init via the main-process IPC handler
 * (`getComposeCatalog`), then synchronous reads. Pure tree helpers below are
 * unit-testable in isolation.
 */

import type {
  ComposeCatalog,
  ComposeCategoryNode,
  ComposeIngredient,
  ComposeMenuNode,
  ComposeRecipeNode,
} from '@shared/types/compose-types';
import { getItem } from './item-db';

let cached: ComposeCatalog | null = null;

export const initComposeCatalog = async (): Promise<void> => {
  if (cached) return;
  cached = await window.wydAPI.getComposeCatalog();
};

export const getComposeCatalog = (): ComposeCatalog => {
  if (!cached) throw new Error('compose-catalog not initialized. Call initComposeCatalog() first.');
  return cached;
};

export const isCategory = (n: ComposeMenuNode): n is ComposeCategoryNode => n.kind === 'category';

// --- Display-name resolution (item-db is the single source of truth for item names) ---
// Menu labels come from missionhelp.dat (node.label); item names come from the item-db.

/** An ingredient's display name + quantity (name resolved via item-db). */
export const composeIngredientName = (ing: ComposeIngredient): string =>
  getItem(ing.itemId)?.name?.trim() || `Item #${ing.itemId}`;

/** Recipe display name: missionhelp label, else its result item (item-db), else `Receita #id`. */
export const composeRecipeName = (node: ComposeRecipeNode): string =>
  node.label?.trim() ||
  (node.result ? getItem(node.result)?.name?.trim() : undefined) ||
  `Receita #${node.index}`;

/** A category's display label: missionhelp label, else a representative item (item-db). */
export const composeCategoryLabel = (node: ComposeCategoryNode): string =>
  node.label?.trim() ||
  (node.fallbackItemId ? getItem(node.fallbackItemId)?.name?.trim() : undefined) ||
  'Combinação';

/** Resolve a drill path (child indices) to the shown category; null if it hits a recipe / out of range. */
export const categoryAtPath = (
  root: ComposeCategoryNode,
  path: readonly number[],
): ComposeCategoryNode | null => {
  let node: ComposeCategoryNode = root;
  for (const idx of path) {
    const child = node.children[idx];
    if (!child || !isCategory(child)) return null;
    node = child;
  }
  return node;
};

/** Breadcrumb labels along a drill path (['Composição', 'Jóia', …]). */
export const composePathLabels = (root: ComposeCategoryNode, path: readonly number[]): string[] => {
  const labels = [composeCategoryLabel(root)];
  let node: ComposeCategoryNode = root;
  for (const idx of path) {
    const child = node.children[idx];
    if (!child || !isCategory(child)) break;
    labels.push(composeCategoryLabel(child));
    node = child;
  }
  return labels;
};
