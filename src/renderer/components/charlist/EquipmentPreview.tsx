import { type FC } from 'react';
import type { MItem } from '@shared/types/item-types';
import { getItemIconUrl } from '../../lib/item-icons';
import { getRefineLevel } from '../../lib/item-enrich';

interface EquipmentPreviewProps {
  /** 18-slot equip array (slot 0 = class-tag, not a wearable). */
  items: MItem[];
  gold: number;
}

/** Hover preview for a char-select slot: equipped item icons (+refine) + gold. DB-free. */
export const EquipmentPreview: FC<EquipmentPreviewProps> = ({ items, gold }) => {
  const equipped = items
    .map((item, slot) => ({ item, slot }))
    .filter(({ item, slot }) => slot !== 0 && item.index !== 0 && getItemIconUrl(item.index));

  return (
    <div className="flex w-[256px] flex-col gap-2 p-3">
      {equipped.length > 0 ? (
        <div className="grid grid-cols-6 gap-1">
          {equipped.map(({ item, slot }) => {
            const refine = getRefineLevel(item);
            return (
              <div
                key={slot}
                className="relative grid size-9 place-items-center rounded border border-gray-700 bg-gray-950"
              >
                <img
                  src={getItemIconUrl(item.index)}
                  alt=""
                  className="size-full object-contain p-0.5"
                  draggable={false}
                />
                {refine > 0 && (
                  <span className="absolute right-0 bottom-0 rounded-tl bg-black/80 px-0.5 font-mono text-[9px] leading-none font-bold text-gold">
                    +{refine}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <span className="text-[11px] text-gray-500">Sem equipamento</span>
      )}
      <div className="flex items-center justify-between border-t border-gray-800 pt-1.5 text-[11px]">
        <span className="text-gray-400">Gold</span>
        <span className="font-mono text-gold tabular-nums">{gold.toLocaleString('pt-BR')}</span>
      </div>
    </div>
  );
};
