import type { ComposeAction, InteractTarget } from '@shared/app-config';
import type { ComposeWireIngredient } from '@shared/types/compose-types';
import type { ViewItem } from '@shared/types/item-types';

/**
 * Pure helpers for the compose actions array <-> editor-draft mapping.
 * Kept out of the component so the assembly logic is unit-testable.
 */

export interface ComposeDraft {
  npcName: string;
  actions: ComposeAction[];
}

export const buildComposeTarget = (draft: ComposeDraft): InteractTarget => ({
  npcName: draft.npcName.trim(),
  npcCategory: 'compose',
  compose: { actions: draft.actions },
});

/** Valid to save iff it has an NPC name and at least one action. */
export const canSaveCompose = (draft: ComposeDraft): boolean =>
  draft.npcName.trim().length > 0 && draft.actions.length > 0;

/** Resolve each recipe ingredient to its bag slot (pure); `missingId` = first one absent.
 *  MItem.stack is always 0 on the wire — the game memsets the packet buffer
 *  and only writes itemId; the server reads the actual stack from the source slot index. */
export const gatherComposeIngredients = (
  action: ComposeAction,
  bag: ViewItem[],
): { gathered: ComposeWireIngredient[]; missingId: number | null } => {
  const gathered: ComposeWireIngredient[] = [];
  for (const ing of action.ingredients) {
    const slot = bag.findIndex((it) => it.index === ing.itemId);
    if (slot < 0) return { gathered, missingId: ing.itemId };
    gathered.push({ itemId: ing.itemId, qty: 0, slot });
  }
  return { gathered, missingId: null };
};
