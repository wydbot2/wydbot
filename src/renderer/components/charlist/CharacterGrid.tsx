import { type FC } from 'react';
import { RadioGroup } from '@headlessui/react';
import type { ViewSelChar } from '@shared/types';
import type { MItem } from '@shared/types/item-types';
import { CharSlot } from './CharSlot';

// Class from the Equip[0] class-tag (value/10 = class); evolution tier is not in the list packet.
const classIdxOf = (classTagIndex: number | undefined): number => {
  const c = Math.floor((classTagIndex ?? 0) / 10);
  return c >= 0 && c <= 3 ? c : 3;
};

const EMPTY_EQUIP: MItem[] = [];

interface CharacterGridProps {
  selChar: ViewSelChar;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export const CharacterGrid: FC<CharacterGridProps> = ({ selChar, selectedIndex, onSelect }) => (
  <RadioGroup
    value={selectedIndex}
    onChange={onSelect}
    className="grid grid-cols-2 gap-2"
    aria-label="Lista de personagens"
  >
    {selChar.names.map((name, index) => (
      <CharSlot
        key={index}
        index={index}
        name={name.name}
        classIdx={classIdxOf(selChar.equips[index]?.items[0]?.index)}
        level={selChar.scores[index]?.level ?? 0}
        gold={selChar.coins[index] ?? 0}
        equips={selChar.equips[index]?.items ?? EMPTY_EQUIP}
      />
    ))}
  </RadioGroup>
);
