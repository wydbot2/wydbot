import { XMarkIcon } from '@heroicons/react/20/solid';
import { type FC } from 'react';
import { getItem } from '../../../lib/item-db';
import { gradeToRarity } from '../../../lib/item-rarity';
import { NumberInput } from '../../shared/NumberInput';
import { Button } from '../../shared/Button';
import { AutoDropItemChip } from '../misc/AutoDropItemChip';

interface ShopRuleChipProps {
  itemId: number;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
  disabled: boolean;
}

/** A single buy-item chip (icon + name + quantity stepper + remove). */
export const ShopRuleChip: FC<ShopRuleChipProps> = ({
  itemId,
  quantity,
  onQuantityChange,
  onRemove,
  disabled,
}) => {
  const item = getItem(itemId);
  const name = item?.name ?? `Item #${itemId}`;
  const rarity = item ? gradeToRarity(item.grade) : 'common';

  return (
    <div className="group inline-flex shrink-0 items-center gap-2 rounded-md border border-amber-400/30 bg-gray-900/60 py-1 pr-1 pl-1 transition-colors hover:border-amber-400/60">
      <span className="inline-flex items-center gap-2 pr-1">
        <AutoDropItemChip itemId={itemId} rarity={rarity} size={28} />
        <span className="text-[11px] font-semibold text-gray-300">{name}</span>
      </span>
      <span className="inline-flex items-center gap-1 pr-0.5">
        <NumberInput
          value={quantity}
          min={1}
          max={99}
          onChange={onQuantityChange}
          disabled={disabled}
          ariaLabel={`Quantidade de ${name}`}
        />
        <span className="text-[10px] text-gray-500">x</span>
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
