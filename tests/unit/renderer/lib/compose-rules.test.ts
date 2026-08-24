import { describe, it, expect } from 'vitest';
import { InteractTargetSchema, type ComposeAction } from '@shared/app-config';
import type { ViewItem } from '@shared/types/item-types';
import {
  buildComposeTarget,
  canSaveCompose,
  gatherComposeIngredients,
  type ComposeDraft,
} from '../../../../src/renderer/lib/compose-rules';

// gatherComposeIngredients reads `index` (item id) + `stackCount`; minimal ViewItem cast.
const stack = (index: number, stackCount?: number): ViewItem => ({ index, stackCount }) as ViewItem;

const action = (over: Partial<ComposeAction> = {}): ComposeAction => ({
  recipeIndex: 1409,
  label: 'Receita',
  menuPath: ['Composição', 'Deserto Desconhecido'],
  ingredients: [{ itemId: 413, qty: 1 }],
  ...over,
});

const draft = (over: Partial<ComposeDraft> = {}): ComposeDraft => ({
  npcName: 'Adventurer',
  actions: [action()],
  ...over,
});

describe('buildComposeTarget', () => {
  it('builds an interact target with trimmed npc name + compose actions', () => {
    const target = buildComposeTarget(draft({ npcName: '  Adventurer  ' }));
    expect(target).toEqual({
      npcName: 'Adventurer',
      npcCategory: 'compose',
      compose: { actions: [action()] },
    });
  });

  it('produces a target that satisfies InteractTargetSchema', () => {
    expect(() => InteractTargetSchema.parse(buildComposeTarget(draft()))).not.toThrow();
  });
});

describe('canSaveCompose', () => {
  it('true with an npc name and at least one action', () => {
    expect(canSaveCompose(draft())).toBe(true);
  });

  it('false with no actions', () => {
    expect(canSaveCompose(draft({ actions: [] }))).toBe(false);
  });

  it('false with a blank npc name', () => {
    expect(canSaveCompose(draft({ npcName: '   ' }))).toBe(false);
  });
});

describe('gatherComposeIngredients', () => {
  it('resolves each ingredient to its bag slot; qty is always 0 (server reads stack from slot)', () => {
    const bag = [stack(100), stack(413, 120), stack(500)];
    const result = gatherComposeIngredients(
      action({ ingredients: [{ itemId: 413, qty: 5 }] }),
      bag,
    );
    expect(result.missingId).toBeNull();
    // qty is always 0 on the wire — the game memsets the MItem packet buffer
    // and only writes itemId; the server reads the actual stack from the source slot.
    expect(result.gathered).toEqual([{ itemId: 413, qty: 0, slot: 1 }]);
  });

  it('reports the first missing ingredient and stops gathering', () => {
    const bag = [stack(413, 10)];
    const result = gatherComposeIngredients(
      action({
        ingredients: [
          { itemId: 413, qty: 1 },
          { itemId: 999, qty: 1 },
        ],
      }),
      bag,
    );
    expect(result.missingId).toBe(999);
    expect(result.gathered).toEqual([{ itemId: 413, qty: 0, slot: 0 }]);
  });

  it('returns an empty list for a recipe with no ingredients', () => {
    expect(gatherComposeIngredients(action({ ingredients: [] }), [])).toEqual({
      gathered: [],
      missingId: null,
    });
  });

  it('qty is always 0 regardless of bag stack count', () => {
    const result = gatherComposeIngredients(action({ ingredients: [{ itemId: 413, qty: 1 }] }), [
      stack(413),
    ]);
    expect(result.gathered).toEqual([{ itemId: 413, qty: 0, slot: 0 }]);
  });
});
