import type { MonsterTarget } from './sections/attack';

// case-insensitive — engine matches MCreateMob.name without case
export const hasMonsterConflict = (
  monsters: ReadonlyArray<MonsterTarget>,
  name: string,
): boolean => {
  const target = name.toLowerCase();
  return monsters.some((m) => m.name.toLowerCase() === target);
};
