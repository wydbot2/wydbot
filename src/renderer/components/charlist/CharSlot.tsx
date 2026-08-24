import { type CSSProperties, type FC } from 'react';
import { Radio } from '@headlessui/react';
import type { MItem } from '@shared/types/item-types';
import { CLASS_DISPLAY_NAMES } from '@shared/constants/character-classes';
import { themeFor } from '../game/personagem/character-helpers';
import { Tooltip } from '../shared/Tooltip';
import { EquipmentPreview } from './EquipmentPreview';

interface CharSlotProps {
  index: number;
  name: string;
  classIdx: number;
  level: number;
  gold: number;
  equips: MItem[];
}

const initialsOf = (name: string): string =>
  name
    .split(/[-\s]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

export const CharSlot: FC<CharSlotProps> = ({ index, name, classIdx, level, gold, equips }) => {
  const isEmpty = !name || name.trim() === '';

  if (isEmpty) {
    return (
      <div
        aria-label="Slot vazio"
        className="flex min-h-[64px] items-center justify-center rounded-xl border border-dashed border-gray-700/60 px-3 py-[11px]"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgb(55 65 81 / 0.10) 0 5px, transparent 5px 10px), rgb(11 18 32 / 0.4)',
        }}
      >
        <span className="text-xs text-gray-500">Slot vazio</span>
      </div>
    );
  }

  const theme = themeFor(classIdx, 0);
  const className = CLASS_DISPLAY_NAMES[classIdx] ?? '';

  return (
    <Tooltip
      placement="right"
      chrome="glass"
      content={<EquipmentPreview items={equips} gold={gold} />}
    >
      <Radio
        value={index}
        aria-label={`Personagem ${name}, ${className}`}
        style={
          {
            '--class-hue': theme.hue,
            '--class-glow': theme.glow,
            '--class-ring': theme.ring,
            background:
              'radial-gradient(90% 120% at 0% 0%, var(--class-glow), transparent 62%), rgb(17 24 39 / 0.55)',
          } as CSSProperties
        }
        className="cs-slot group flex min-h-[64px] cursor-pointer items-center gap-[11px] rounded-xl border border-gray-700 px-3 py-[11px] text-left transition-[border-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-gray-600 data-[checked]:border-accent-500 data-[checked]:shadow-[0_0_0_1px_var(--color-accent-500),0_8px_22px_-14px_rgba(59,130,246,0.7)] data-[focus]:ring-2 data-[focus]:ring-accent-500 data-[focus]:ring-offset-2 data-[focus]:ring-offset-gray-900 data-[focus]:outline-none"
      >
        <div
          className="grid size-[46px] shrink-0 place-items-center rounded-[12px] text-base leading-none font-bold text-white"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--class-hue) 60%, #000), color-mix(in srgb, var(--class-hue) 30%, #000))',
            border: '2px solid var(--class-hue)',
            boxShadow: '0 5px 16px var(--class-glow)',
          }}
        >
          {initialsOf(name)}
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-gray-100">{name}</span>
          <span
            className="text-[10.5px] font-semibold tracking-[0.05em] uppercase"
            style={{ color: 'var(--class-hue)' }}
          >
            {className}
            <span className="ml-1 font-medium text-gray-500 normal-case">· Lv {level}</span>
          </span>
        </div>
      </Radio>
    </Tooltip>
  );
};
