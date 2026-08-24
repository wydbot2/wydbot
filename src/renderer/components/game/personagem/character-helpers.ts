import type { ViewItem } from '@shared/types/item-types';
import { hasLearnedSkillBit } from '@shared/lib/skill-utils';
import { ECharClass } from '@shared/types/game-structures';
import {
  AFFECT_NAME_MAP,
  type AffectMeta,
  CLASS_THEME,
  type ClassTheme,
  type ItemRarity,
  TIER_TO_RARITY,
} from './character-tables';

const RARITY_ORDER: Record<ItemRarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legend: 3,
};

export const themeFor = (classIdx: number, tier: number): ClassTheme =>
  CLASS_THEME[`${classIdx}-${tier}`] ?? CLASS_THEME['3-0'];

export const inferRarity = (item: ViewItem | undefined): ItemRarity => {
  if (!item || item.index === 0) return 'common';
  let best: ItemRarity = 'common';
  for (const ef of item.effects) {
    if (!ef.colorTier) continue;
    const candidate = TIER_TO_RARITY[ef.colorTier];
    if (RARITY_ORDER[candidate] > RARITY_ORDER[best]) best = candidate;
  }
  return best;
};

export const extractRefineTier = (name: string): string => {
  const match = name.match(/\+(\d+)/);
  return match ? `+${match[1]}` : '';
};

export const sumGearStat = (equip: ReadonlyArray<ViewItem>, statIndex: number): number => {
  let total = 0;
  for (const item of equip) {
    for (const ef of item.effects) {
      if (ef.index === statIndex) total += ef.value;
    }
  }
  return total;
};

export const resolveAffect = (type: number): AffectMeta =>
  AFFECT_NAME_MAP[type] ?? {
    name: `Efeito #${type.toString(16).padStart(2, '0')}`,
    kind: 'buff',
  };

export const getMasteryCap = (
  charClass: number,
  level: number,
  isCelestial: boolean,
  learnedSkill: readonly [number, number],
): readonly [number, number, number, number] => {
  const base = isCelestial ? 200 : Math.min(Math.floor((level * 3 + 3) / 2), 200);
  const isLearned = (id: number) => hasLearnedSkillBit(learnedSkill, id);

  let cap0 = base;
  if (charClass === ECharClass.TK && isLearned(205)) cap0 = 280;
  else if (charClass === ECharClass.BM && isLearned(233)) cap0 = 230;

  let cap1 = base;
  if (isLearned(200)) cap1 = 320;
  else if (isLearned(31)) cap1 = 255;
  if (charClass === ECharClass.HT && isLearned(238)) cap1 = 400;

  let cap2 = base;
  if (isLearned(204)) cap2 = 320;
  else if (isLearned(39)) cap2 = 255;

  let cap3 = base;
  if (isLearned(208)) cap3 = 320;
  else if (isLearned(47)) cap3 = 255;

  return [cap0, cap1, cap2, cap3];
};
