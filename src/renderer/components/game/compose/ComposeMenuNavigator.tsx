import { FolderIcon, ChevronRightIcon, PlusIcon, Cog6ToothIcon } from '@heroicons/react/20/solid';
import { type FC } from 'react';
import type { ComposeCategoryNode, ComposeRecipeNode } from '@shared/types/compose-types';
import {
  categoryAtPath,
  composeCategoryLabel,
  composeIngredientName,
  composePathLabels,
  composeRecipeName,
  isCategory,
} from '../../../lib/compose-catalog';

interface ComposeMenuNavigatorProps {
  root: ComposeCategoryNode;
  /** Drill path as child indices from the root. */
  path: readonly number[];
  onEnter: (childIndex: number) => void;
  /** Jump the breadcrumb to `depth` (0 = root). */
  onCrumb: (depth: number) => void;
  onAddRecipe: (recipe: ComposeRecipeNode) => void;
}

export const ComposeMenuNavigator: FC<ComposeMenuNavigatorProps> = ({
  root,
  path,
  onEnter,
  onCrumb,
  onAddRecipe,
}) => {
  const current = categoryAtPath(root, path) ?? root;
  const crumbs = composePathLabels(root, path);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-400">Menu do NPC</label>

      <div className="mb-2 flex flex-wrap items-center gap-1 text-[12px] text-gray-400">
        {crumbs.map((label, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-gray-600">▸</span>}
              {last ? (
                <span className="font-medium text-gray-200">{label}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onCrumb(i)}
                  className="text-gray-400 transition-colors hover:text-accent-300"
                >
                  {label}
                </button>
              )}
            </span>
          );
        })}
      </div>

      <div className="divide-y divide-gray-800 overflow-hidden rounded-md border border-gray-700 bg-gray-900/40">
        {current.children.map((child, idx) =>
          isCategory(child) ? (
            <button
              key={idx}
              type="button"
              onClick={() => onEnter(idx)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-700/40"
            >
              <FolderIcon className="h-4 w-4 shrink-0 text-accent-400" aria-hidden="true" />
              <span className="flex-1 truncate text-[13px] text-gray-200">
                {composeCategoryLabel(child)}
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
            </button>
          ) : (
            <div key={idx} className="flex items-center gap-2.5 px-3 py-2">
              <Cog6ToothIcon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-gray-200">
                  {composeRecipeName(child)}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {child.ingredients.map((ing, k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-400"
                    >
                      <span className="text-gray-500">×{ing.qty}</span> {composeIngredientName(ing)}
                    </span>
                  ))}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onAddRecipe(child)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-gray-600/60 bg-gray-900/40 py-1 pr-2 pl-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-emerald-400/60 hover:text-gray-200"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                ação
              </button>
            </div>
          ),
        )}
        {current.children.length === 0 && (
          <div className="px-3 py-2.5 text-[12px] text-gray-500">Categoria vazia.</div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        📁 abre outro menu · ⚙ é uma receita — &ldquo;+ ação&rdquo; adiciona à direita.
      </p>
    </div>
  );
};
