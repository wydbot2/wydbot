import { ShieldCheckIcon, ShieldExclamationIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { type FC } from 'react';
import type { AutoDropRule } from '@shared/app-config';
import { getItem } from '../../../lib/item-db';
import { gradeToRarity } from '../../../lib/item-rarity';
import { Button } from '../../shared/Button';
import { Tooltip } from '../../shared/Tooltip';
import { AutoDropItemChip } from './AutoDropItemChip';
import { AutoDropRuleTooltipContent } from './AutoDropRuleTooltipContent';

interface AutoDropRuleChipProps {
  rule: AutoDropRule;
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
}

export const AutoDropRuleChip: FC<AutoDropRuleChipProps> = ({
  rule,
  onEdit,
  onRemove,
  disabled,
}) => {
  const item = getItem(rule.itemId);
  const name = item?.name ?? `Item #${rule.itemId}`;
  const rarity = item ? gradeToRarity(item.grade) : 'common';
  const dropCount = rule.dropGroups.reduce((n, g) => n + g.length, 0);
  const keepCount = (rule.keepGroups ?? []).reduce((n, g) => n + g.length, 0);

  const chip = (
    <div className="group inline-flex shrink-0 items-center gap-2 rounded-md border border-cyan-400/30 bg-gray-900/60 py-1 pr-1 pl-1 transition-colors hover:border-cyan-400/60">
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        aria-label={`Editar ${name}`}
        className="inline-flex cursor-pointer items-center gap-2 pr-1 disabled:cursor-not-allowed"
      >
        <AutoDropItemChip itemId={rule.itemId} rarity={rarity} size={28} />
        <span className="text-[11px] font-semibold text-gray-300">{name}</span>
        {dropCount > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-gray-800 px-1 font-mono text-[10px] text-red-400">
            <ShieldExclamationIcon className="h-3 w-3" aria-hidden />
            {dropCount}
          </span>
        )}
        {keepCount > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-gray-800 px-1 font-mono text-[10px] text-emerald-400">
            <ShieldCheckIcon className="h-3 w-3" aria-hidden />
            {keepCount}
          </span>
        )}
      </button>
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

  if (dropCount === 0 && keepCount === 0) return chip;

  return (
    <Tooltip content={<AutoDropRuleTooltipContent rule={rule} />} placement="top" chrome="glass">
      {chip}
    </Tooltip>
  );
};
