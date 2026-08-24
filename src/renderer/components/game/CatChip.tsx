import { type FC } from 'react';
import type { NpcCategory } from '@shared/types';
import { Tooltip } from '../shared/Tooltip';
import { NPC_CATEGORY_META } from './npc-category-meta';

interface CatChipProps {
  category: NpcCategory;
  size?: 'sm' | 'md';
}

/** Icon-only category marker with the label as a tooltip — for dense rows. */
export const CatIcon: FC<{ category: NpcCategory }> = ({ category }) => {
  const { label, colorHex, Icon } = NPC_CATEGORY_META[category];
  return (
    <Tooltip content={label} placement="top">
      <span className="inline-flex shrink-0" style={{ color: colorHex }}>
        <Icon className="h-4 w-4" />
      </span>
    </Tooltip>
  );
};

/** Category pill — Heroicon + label tinted by the category's pink-family hex. */
export const CatChip: FC<CatChipProps> = ({ category, size = 'md' }) => {
  const { label, colorHex, Icon } = NPC_CATEGORY_META[category];
  const pad = size === 'sm' ? 'gap-1 px-1.5 py-0.5 text-[10px]' : 'gap-1.5 px-2 py-1 text-[11px]';
  const ic = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded font-medium ${pad}`}
      style={{
        color: colorHex,
        backgroundColor: `${colorHex}1f`,
        boxShadow: `inset 0 0 0 1px ${colorHex}57`,
      }}
    >
      <Icon className={ic} />
      {label}
    </span>
  );
};
