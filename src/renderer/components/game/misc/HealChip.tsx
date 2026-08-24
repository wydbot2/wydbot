import { type FC } from 'react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import type { HealAction } from '@shared/app-config/v1/sections/auto-healing';
import { Button } from '../../shared/Button';
import { AutoDropItemChip } from './AutoDropItemChip';
import { RARITY, type ItemRarity } from '../personagem/character-tables';
import { getItem, getSkill } from '../../../lib/item-db';

interface HealChipProps {
  action: HealAction;
  onRemove: () => void;
  disabled?: boolean;
}

const SKILL_BORDER = 'rgb(34 211 238 / 0.30)'; // cyan-400/30

const itemRarity = (gradeOrNull: number | undefined): ItemRarity => {
  if (gradeOrNull === undefined || gradeOrNull === 0) return 'common';
  if (gradeOrNull <= 5) return 'rare';
  if (gradeOrNull <= 9) return 'epic';
  return 'legend';
};

/**
 * Unified item-or-skill chip used in Auto Healing rule lines. Items render
 * via `AutoDropItemChip` (rarity border); skills render with a cyan-bordered
 * monospace letter tile. Outer pill wraps both branches with a consistent
 * shape + X-remove button (BuffChipFixed idiom).
 */
export const HealChip: FC<HealChipProps> = ({ action, onRemove, disabled = false }) => {
  if (action.kind === 'item') {
    const item = getItem(action.refId);
    const name = item?.name ?? `#${action.refId}`;
    const rarity = itemRarity(item?.grade);
    const ring = RARITY[rarity];
    return (
      <div
        className="group inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-gray-900/60 py-0.5 pr-1 pl-1 transition-colors"
        style={{ borderColor: ring }}
        title={`Item · ${name}`}
      >
        <AutoDropItemChip itemId={action.refId} rarity={rarity} size={22} />
        <span className="text-[11px] font-medium text-gray-300">{name}</span>
        <Button
          variant="ghost-danger"
          size="icon-xs"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remover ${name}`}
        >
          <XMarkIcon className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  const skill = getSkill(action.refId);
  const name = skill?.name ?? `Skill #${action.refId}`;
  const letter = name[0] ?? '?';
  return (
    <div
      className="group inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-gray-900/60 py-0.5 pr-1 pl-1 transition-colors"
      style={{ borderColor: SKILL_BORDER }}
      title={`Skill · ${name}`}
    >
      <span
        className="grid h-[22px] w-[22px] shrink-0 place-items-center overflow-hidden rounded-sm border border-gray-700"
        style={{ background: 'linear-gradient(135deg, #1f2937 0%, #0b0f17 100%)' }}
      >
        {skill?.iconUrl ? (
          <img
            src={skill.iconUrl}
            alt=""
            className="h-full w-full object-contain p-0.5"
            draggable={false}
          />
        ) : (
          <span className="font-mono text-[10px] font-bold text-cyan-300">{letter}</span>
        )}
      </span>
      <span className="text-[11px] font-medium text-gray-300">{name}</span>
      <Button
        variant="ghost-danger"
        size="icon-xs"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remover ${name}`}
      >
        <XMarkIcon className="h-3 w-3" />
      </Button>
    </div>
  );
};
