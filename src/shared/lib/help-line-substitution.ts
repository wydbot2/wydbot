import type { ItemHelp, ItemHelpLine } from '@shared/types/item-db-types';
import type { MItem } from '@shared/types/item-types';

const SUBSTITUTABLE_SLOTS = 7;
const PLACEHOLDER = '%d';

const slotValue = (slot: number, item: MItem): number => {
  switch (slot) {
    case 0:
      return item.effects[0].index;
    case 1:
      return item.effects[0].value;
    case 2:
      return item.effects[1].index;
    case 3:
      return item.effects[1].value;
    case 4:
      return item.effects[2].index;
    case 5:
      return item.effects[2].value;
    case 6:
      return item.stackCount & 0xffff;
    default:
      return 0;
  }
};

const substituteLine = (line: ItemHelpLine, value: number): ItemHelpLine => ({
  color: line.color,
  text: line.text.split(PLACEHOLDER).join(String(value)),
});

export const renderHelpLines = (help: ItemHelp, item: MItem): ItemHelpLine[] => {
  const out: ItemHelpLine[] = [];
  const count = help.count;

  for (let slot = 0; slot < help.lines.length; slot += 1) {
    const line = help.lines[slot];
    if (!line || line.text.trim() === '') continue;

    if (count === 0 || slot >= SUBSTITUTABLE_SLOTS || !line.text.includes(PLACEHOLDER)) {
      out.push(line);
      continue;
    }

    const value = slotValue(slot, item);
    if (count === 1 && value === 0) {
      continue;
    }

    out.push(substituteLine(line, value));
  }

  return out;
};
