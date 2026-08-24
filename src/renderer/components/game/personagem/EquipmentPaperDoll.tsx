import { type FC } from 'react';
import type { ViewItem } from '@shared/types/item-types';
import { SectionCard } from '../../shared/SectionCard';
import { EquipCell } from './EquipCell';
import { type PaperDollSlot, SLOT_META } from './character-tables';

interface EquipmentPaperDollProps {
  equip: ViewItem[];
}

export const EquipmentPaperDoll: FC<EquipmentPaperDollProps> = ({ equip }) => (
  <SectionCard title="Equipamento">
    <div
      className="relative mx-auto rounded-lg"
      style={{
        width: 320,
        height: 290,
        background: 'radial-gradient(60% 70% at 50% 45%, rgb(75 85 99 / 0.18), transparent 70%)',
      }}
    >
      {(Object.entries(SLOT_META) as [PaperDollSlot, (typeof SLOT_META)[PaperDollSlot]][]).map(
        ([slot, { index, x, y }]) => (
          <div key={slot} className="absolute" style={{ left: x, top: y, width: 52, height: 52 }}>
            <EquipCell slot={slot} item={equip[index]} size={52} />
          </div>
        ),
      )}
    </div>
  </SectionCard>
);
