/**
 * Types for the composition (Item-Mix) menu catalog.
 *
 * Source: `Missionitems.bin` (Lang/PT `Missionhelp.dat` for node labels) — the
 * data behind the game's `PanelMissionMix` NPC menu (window 0x1e).
 * Parsed by `src/main/game-assets/parsers/missionitems-bin.ts` and resolved into
 * the tree below by `compose-catalog-builder.ts`.
 */

/** One ingredient slot: an item id + its required quantity (≥1). */
export interface ComposeIngredient {
  readonly itemId: number;
  readonly qty: number;
}

/** A gathered ingredient ready for the 0x2e7 wire: item + source slot.
 *  `qty` is always 0 on the wire — the game memsets the MItem packet buffer
 *  and only writes itemId; the server reads the actual stack from `slot`. */
export interface ComposeWireIngredient {
  itemId: number;
  qty: number;
  slot: number;
}

/**
 * A displayable composition recipe (or category) from `Missionitems.bin` — one row
 * of the menu.
 */
export interface MissionRecipe {
  /** `rowid` (record `+0x08`) — the recipe id sent on the wire (C2S `0x2e7`). */
  readonly index: number;
  /** `groupKey` (record `+0x04`) — the per-NPC root selector. */
  readonly rootKey: number;
  /** Top-level marker (record `+0x0C`); `-1` ⇒ a top-level row. (Back-pointer only — NOT the tree link.) */
  readonly parent: number;
  /** Child rowids (record `+0x10`); non-empty ⇒ category, empty ⇒ leaf recipe. */
  readonly children: readonly number[];
  /** Produced item id (`0` ⇒ a category / bulk-conversion node). */
  readonly result: number;
  /** Ingredient items + quantities (item ids `+0x70`, qty from `+0x1C0` type-6 cells). */
  readonly ingredients: readonly ComposeIngredient[];
}

// ---------------------------------------------------------------------------
// Catalog tree — what the renderer consumes. Built from the raw MissionRecipe[]
// + missionhelp labels in `compose-catalog-builder.ts`. NOTE: nodes carry only
// item IDs + menu labels — ITEM names are resolved in the renderer via the
// item-db (the single source of truth), not baked here.
// ---------------------------------------------------------------------------

/** A recipe leaf in the menu tree. Item names resolve via item-db in the renderer. */
export interface ComposeRecipeNode {
  readonly kind: 'recipe';
  /** Missionitems `rowid` — the value sent on the wire (`0x2e7`) and a stable id. */
  readonly index: number;
  /** Menu label from Missionhelp.dat (when present); else the renderer names it by `result`. */
  readonly label?: string;
  /** Produced item id (`0` ⇒ a bulk-conversion / no-result node). */
  readonly result: number;
  readonly ingredients: readonly ComposeIngredient[];
  readonly goldCost: number;
}

/** A category node — opens children ("menu items que abrem outros items"). */
export interface ComposeCategoryNode {
  readonly kind: 'category';
  /** Menu label from Missionhelp.dat (when present); else named by `fallbackItemId` (item-db). */
  readonly label?: string;
  /** Representative item id used to name the category when there is no missionhelp label. */
  readonly fallbackItemId?: number;
  readonly children: readonly ComposeMenuNode[];
  /** Set only on the top-level per-NPC root groups; matches the NPC's `composeRoot`. */
  readonly rootKey?: number;
}

export type ComposeMenuNode = ComposeCategoryNode | ComposeRecipeNode;

/** The full composition catalog: a navigable tree + a recipe count. */
export interface ComposeCatalog {
  readonly root: ComposeCategoryNode;
  readonly recipeCount: number;
}
