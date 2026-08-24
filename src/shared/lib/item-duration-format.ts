import { MItemDefinition } from '@shared/constants/item-definitions';
import type { MItemEffect } from '@shared/types/item-types';

export const TIME_EFFECT_INDICES: ReadonlySet<number> = new Set([
  MItemDefinition.CONTMES,
  MItemDefinition.CONTHOR,
  MItemDefinition.CONTMIN,
  MItemDefinition.CONTANO,
  MItemDefinition.CONTDIA,
]);

const FMT_DAYS = '%d Dia(s)';
const FMT_HOURS = '%d Horas(s)';
const FMT_MINUTES = '%d Min(s)';

const PREMIUM_ITEM_RANGE_START = 0xf3c;
const PREMIUM_ITEM_RANGE_END = 0xf81;

const substitute = (fmt: string, value: number): string => fmt.replace('%d', String(value));

export const formatItemDuration = (
  effects: ReadonlyArray<MItemEffect>,
  itemId: number,
): string | null => {
  if (itemId < PREMIUM_ITEM_RANGE_START || itemId > PREMIUM_ITEM_RANGE_END) {
    return null;
  }

  let days = 0;
  let hours = 0;
  let minutes = 0;

  for (const ef of effects) {
    switch (ef.index) {
      case MItemDefinition.CONTMES:
        days = ef.value;
        break;
      case MItemDefinition.CONTHOR:
        hours = ef.value;
        break;
      case MItemDefinition.CONTMIN:
        minutes = ef.value;
        break;
    }
  }

  if (days === 0 && hours === 0 && minutes === 0) {
    return null;
  }

  const parts: string[] = [];
  if (days > 0) parts.push(substitute(FMT_DAYS, days));
  if (hours > 0) parts.push(substitute(FMT_HOURS, hours));
  if (minutes > 0) parts.push(substitute(FMT_MINUTES, minutes));
  return parts.length > 0 ? parts.join(' ') : null;
};
