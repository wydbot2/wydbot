import { XMarkIcon, Cog6ToothIcon } from '@heroicons/react/20/solid';
import { type FC } from 'react';
import type { ComposeAction } from '@shared/app-config';
import { composeIngredientName } from '../../../lib/compose-catalog';
import { Button } from '../../shared/Button';

interface ComposeActionChipProps {
  action: ComposeAction;
  onRemove: () => void;
}

/** A staged "Compor X" action: recipe name + menu-path/ingredient context + remove. */
export const ComposeActionChip: FC<ComposeActionChipProps> = ({ action, onRemove }) => {
  const ingredients = action.ingredients
    .map((i) => `${i.qty}× ${composeIngredientName(i)}`)
    .join(', ');
  const subtitle = [action.menuPath.join(' ▸ '), ingredients].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-emerald-400/30 bg-gray-900/60 py-1.5 pr-1 pl-2.5">
      <Cog6ToothIcon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-gray-200">
          Compor &ldquo;{action.label}&rdquo;
        </span>
        <span className="block truncate text-[10px] text-gray-500">{subtitle}</span>
      </span>
      <Button
        variant="ghost-danger"
        size="icon-xs"
        onClick={onRemove}
        aria-label={`Remover ${action.label}`}
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
