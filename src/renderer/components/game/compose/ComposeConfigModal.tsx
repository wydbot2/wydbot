import { type FC, useEffect, useMemo, useState } from 'react';
import type { ComposeAction, InteractTarget } from '@shared/app-config';
import type {
  ComposeCatalog,
  ComposeCategoryNode,
  ComposeRecipeNode,
} from '@shared/types/compose-types';
import {
  initComposeCatalog,
  getComposeCatalog,
  composePathLabels,
  composeRecipeName,
} from '../../../lib/compose-catalog';
import { buildComposeTarget, canSaveCompose } from '../../../lib/compose-rules';
import { Button } from '../../shared/Button';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { Modal } from '../../shared/Modal';
import { ComposeMenuNavigator } from './ComposeMenuNavigator';
import { ComposeActionChip } from './ComposeActionChip';

interface ComposeConfigModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  npcName?: string;
  /** The NPC's compose root group (entity+0x750); scopes the menu to that subtree. */
  composeRoot?: number;
  initialActions: ComposeAction[];
  onSave: (target: InteractTarget) => void;
  onClose: () => void;
}

/**
 * Composition (Item-Mix) editor — opens when interacting with a composition NPC
 * (category `compose`), like the bank's config modal. Navigate the recipe tree,
 * stage "Compor X" actions, and persist them on the interact step (mirrors bank).
 * Each staged action submits once (0x2e7) when the macro reaches the NPC.
 */
export const ComposeConfigModal: FC<ComposeConfigModalProps> = ({
  isOpen,
  mode,
  npcName,
  composeRoot,
  initialActions,
  onSave,
  onClose,
}) => {
  const [catalog, setCatalog] = useState<ComposeCatalog | null>(null);
  const [error, setError] = useState(false);
  const [path, setPath] = useState<number[]>([]);
  const [actions, setActions] = useState<ComposeAction[]>([]);
  const [confirm, setConfirm] = useState<{ idx: number; label: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPath([]);
    setActions(initialActions);
    setConfirm(null);
    setError(false);
    let cancelled = false;
    void (async () => {
      try {
        await initComposeCatalog();
        if (!cancelled) setCatalog(getComposeCatalog());
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, initialActions]);

  // Scope the menu to the NPC's compose root group (Adventurer → 36, …); each NPC
  // shows only its own subtree. Falls back to the whole catalog if no/unknown root.
  const scopedRoot = useMemo<ComposeCategoryNode | null>(() => {
    if (!catalog) return null;
    if (composeRoot == null) return catalog.root;
    const group = catalog.root.children.find(
      (c): c is ComposeCategoryNode => c.kind === 'category' && c.rootKey === composeRoot,
    );
    return group ? { ...group, label: 'Composição' } : catalog.root;
  }, [catalog, composeRoot]);

  const addRecipe = (recipe: ComposeRecipeNode): void => {
    if (!scopedRoot) return;
    const action: ComposeAction = {
      recipeIndex: recipe.index,
      label: composeRecipeName(recipe),
      menuPath: composePathLabels(scopedRoot, path),
      ingredients: recipe.ingredients.map((i) => ({ itemId: i.itemId, qty: i.qty })),
    };
    setActions((prev) => [...prev, action]);
  };

  const canSave = canSaveCompose({ npcName: npcName ?? '', actions });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={mode === 'edit' ? 'Editar composição' : 'Composição'}
      headerAction={
        npcName ? <span className="text-[11px] text-gray-500">{npcName}</span> : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() => onSave(buildComposeTarget({ npcName: npcName ?? '', actions }))}
          >
            Salvar
          </Button>
        </>
      }
    >
      {error ? (
        <p className="py-6 text-center text-sm text-gray-400">
          Catálogo de composição indisponível. Reinicie para baixar os dados do jogo
          (Missionitems.bin).
        </p>
      ) : !scopedRoot ? (
        <p className="py-6 text-center text-sm text-gray-500">Carregando receitas…</p>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          <ComposeMenuNavigator
            root={scopedRoot}
            path={path}
            onEnter={(childIndex) => setPath((p) => [...p, childIndex])}
            onCrumb={(depth) => setPath((p) => p.slice(0, depth))}
            onAddRecipe={addRecipe}
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Ações do macro</label>
            <div className="space-y-1.5">
              {actions.map((a, idx) => (
                <ComposeActionChip
                  key={`${a.recipeIndex}-${idx}`}
                  action={a}
                  onRemove={() => setConfirm({ idx, label: a.label })}
                />
              ))}
            </div>
            {actions.length === 0 && (
              <p className="mt-1 text-[11px] text-gray-500">
                Navegue o menu à esquerda e clique em &ldquo;+ ação&rdquo; numa receita.
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirm != null}
        title={`Remover "${confirm?.label}"?`}
        message="Essa ação sai da lista. Você pode adicioná-la novamente depois."
        confirmLabel="Remover"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) setActions((prev) => prev.filter((_, i) => i !== confirm.idx));
          setConfirm(null);
        }}
      />
    </Modal>
  );
};
