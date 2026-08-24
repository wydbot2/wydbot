import { type FC } from 'react';
import type { IpcShopItem } from '@shared/ipc/ipc-api';
import { getItem } from '../../../lib/item-db';
import { gradeToRarity } from '../../../lib/item-rarity';
import { AutoDropItemChip } from '../misc/AutoDropItemChip';

interface ShopItemGridProps {
  items: IpcShopItem[];
  selectedIds: number[];
  onPick: (itemId: number) => void;
}

export const ShopItemGrid: FC<ShopItemGridProps> = ({ items, selectedIds, onPick }) => {
  const selected = new Set(selectedIds);

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const item = getItem(it.itemId);
        const name = item?.name ?? `Item #${it.itemId}`;
        const rarity = item ? gradeToRarity(item.grade) : 'common';
        const dupe = selected.has(it.itemId);

        return (
          <button
            key={it.itemId}
            type="button"
            disabled={dupe}
            onClick={() => onPick(it.itemId)}
            className="group inline-flex shrink-0 items-center gap-2 rounded-md border border-gray-700 bg-gray-900/60 px-2 py-1 transition-colors hover:border-amber-400/60 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AutoDropItemChip itemId={it.itemId} rarity={rarity} size={28} dim={dupe} />
            <span className="max-w-[100px] truncate text-[11px] font-medium text-gray-300 group-hover:text-white">
              {name}
            </span>
          </button>
        );
      })}
    </div>
  );
};
