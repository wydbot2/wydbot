import { type FC, useState } from 'react';
import { Icon } from '@iconify/react';
import type { ViewItem } from '@shared/types/item-types';
import { getItemIconUrl } from '../../../lib/item-icons';
import { Tooltip } from '../../shared/Tooltip';
import { ItemTooltipContent } from '../ItemTooltipContent';
import './character-icons';
import { type PaperDollSlot, RARITY, SLOT_META } from './character-tables';
import { extractRefineTier, inferRarity } from './character-helpers';

interface EquipCellProps {
  slot: PaperDollSlot;
  item?: ViewItem;
  size?: number;
}

export const EquipCell: FC<EquipCellProps> = ({ slot, item, size = 52 }) => {
  const filled = item != null && item.index !== 0;
  const { icon: iconName, label } = SLOT_META[slot];
  // A 404 at wydicon:// (PNG missing/quarantined) flips to the slot-icon fallback.
  // Keyed by URL so a new item id resets the failure automatically.
  const [failedUrl, setFailedUrl] = useState<string>();

  if (!filled) {
    return (
      <div
        className="relative grid place-items-center overflow-hidden rounded-md border border-dashed border-gray-600/50"
        style={{
          width: size,
          height: size,
          background:
            'repeating-linear-gradient(45deg, rgb(75 85 99 / 0.08) 0 6px, transparent 6px 12px), rgb(11 18 32 / 0.5)',
        }}
      >
        <div className="flex flex-col items-center gap-0.5 text-center">
          <Icon icon={iconName} className="h-4 w-4 text-gray-500/60" />
          <span className="text-[9px] font-semibold tracking-wider text-gray-500 uppercase">
            {label}
          </span>
        </div>
      </div>
    );
  }

  const rarity = inferRarity(item);
  const ring = RARITY[rarity];
  const tier = extractRefineTier(item.name);
  const iconUrl = getItemIconUrl(item.index);
  const showIcon = iconUrl !== undefined && failedUrl !== iconUrl;

  return (
    <Tooltip
      placement="top"
      chrome="glass"
      content={<ItemTooltipContent item={item} label={label} />}
    >
      <div
        className="relative grid place-items-center overflow-hidden rounded-md border bg-[rgb(11_18_32_/_0.85)] transition-transform duration-150 hover:-translate-y-px hover:shadow-lg"
        style={{ width: size, height: size, borderColor: ring }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${ring}55, transparent 60%)` }}
        />
        {showIcon ? (
          <img
            src={iconUrl}
            alt={item.name}
            className="relative z-10 h-full w-full object-contain p-1"
            draggable={false}
            onError={() => setFailedUrl(iconUrl)}
          />
        ) : (
          <Icon
            icon={iconName}
            className="relative z-10 h-[26px] w-[26px]"
            style={{ color: ring, filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.6))' }}
          />
        )}
        {tier && (
          <span className="absolute right-1 bottom-0.5 z-20 rounded bg-black/75 px-1 py-px font-mono text-[10px] font-bold tracking-wider text-gray-100">
            {tier}
          </span>
        )}
      </div>
    </Tooltip>
  );
};
