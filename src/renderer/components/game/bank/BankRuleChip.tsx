import { XMarkIcon } from '@heroicons/react/20/solid';
import { type FC } from 'react';
import { getItem } from '../../../lib/item-db';
import { gradeToRarity } from '../../../lib/item-rarity';
import { Button } from '../../shared/Button';
import { AutoDropItemChip } from '../misc/AutoDropItemChip';

interface BankRuleChipProps {
  itemId: number;
  onRemove: () => void;
  disabled: boolean;
}

/** A single deposit-item chip (icon + name + remove). Deposit rules carry no attrs in v1. */
export const BankRuleChip: FC<BankRuleChipProps> = ({ itemId, onRemove, disabled }) => {
  const item = getItem(itemId);
  const name = item?.name ?? `Item #${itemId}`;
  const rarity = item ? gradeToRarity(item.grade) : 'common';

  return (
    <div className="group inline-flex shrink-0 items-center gap-2 rounded-md border border-emerald-400/30 bg-gray-900/60 py-1 pr-1 pl-1 transition-colors hover:border-emerald-400/60">
      <span className="inline-flex items-center gap-2 pr-1">
        <AutoDropItemChip itemId={itemId} rarity={rarity} size={28} />
        <span className="text-[11px] font-semibold text-gray-300">{name}</span>
      </span>
      <Button
        variant="ghost-danger"
        size="icon-xs"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remover ${name}`}
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
