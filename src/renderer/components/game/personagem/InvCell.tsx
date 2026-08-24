import { type FC, type MouseEvent, useState } from 'react';
import type { ViewItem } from '@shared/types/item-types';
import { getItemIconUrl } from '../../../lib/item-icons';
import { Tooltip } from '../../shared/Tooltip';
import { ItemTooltipContent } from '../ItemTooltipContent';

interface InvCellProps {
  item?: ViewItem;
  size?: number;
  locked?: boolean;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
}

export const InvCell: FC<InvCellProps> = ({ item, size = 56, locked = false, onContextMenu }) => {
  const filled = item != null && item.index !== 0;
  const lockedStyle = locked ? { opacity: 0.55, filter: 'grayscale(0.6)' as const } : undefined;
  // A 404 at wydicon:// (PNG missing/quarantined) flips to the text fallback.
  // Keyed by URL so a new item id resets the failure automatically.
  const [failedUrl, setFailedUrl] = useState<string>();

  if (!filled) {
    return (
      <div
        className="relative rounded-md border border-gray-700/40"
        aria-label="slot vazio"
        style={{
          width: size,
          height: size,
          background:
            'repeating-linear-gradient(45deg, rgb(55 65 81 / 0.1) 0 4px, transparent 4px 8px), rgb(11 18 32 / 0.5)',
          ...lockedStyle,
        }}
      />
    );
  }

  const iconUrl = getItemIconUrl(item.index);
  const showIcon = iconUrl !== undefined && failedUrl !== iconUrl;
  // Mutex with refine priority — refine wins when both are present (e.g. amago).
  // Count is shown only when refine is absent (consumables, plain stackables).
  const overlayText =
    item.refineLevel !== undefined
      ? `+${item.refineLevel}`
      : item.stackCount !== undefined
        ? String(item.stackCount)
        : '';
  const overlayDim = item.refineLevel !== undefined && item.refineLevel >= 10;

  return (
    <Tooltip placement="top" chrome="glass" content={<ItemTooltipContent item={item} />}>
      <div
        onContextMenu={onContextMenu}
        className="relative grid place-items-center overflow-hidden rounded-md border border-gray-600/60 transition-transform duration-150 hover:scale-[1.04]"
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, rgb(37 99 235 / 0.10), rgb(15 23 42 / 0.7))',
          ...lockedStyle,
        }}
      >
        {showIcon ? (
          <img
            src={iconUrl}
            alt={item.name}
            className="h-full w-full object-contain p-1"
            draggable={false}
            onError={() => setFailedUrl(iconUrl)}
          />
        ) : (
          <span className="line-clamp-3 px-1 text-center text-[9px] leading-tight font-medium text-gray-100">
            {item.name}
          </span>
        )}
        {overlayText && (
          <span
            aria-hidden
            className={`pointer-events-none absolute right-1 bottom-0.5 z-20 font-mono text-[10px] font-bold tabular-nums ${overlayDim ? 'text-gray-100/60' : 'text-gray-100'}`}
            style={{ textShadow: '0 1px 2px rgb(0 0 0 / 0.9), 0 0 3px rgb(0 0 0 / 0.7)' }}
          >
            {overlayText}
          </span>
        )}
      </div>
    </Tooltip>
  );
};
