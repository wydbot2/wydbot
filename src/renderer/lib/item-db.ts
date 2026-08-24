import type { Item, ItemDb } from '@shared/types/item-db-types';
import type { Skill } from '@shared/types/skill-types';
import type { ECharClass } from '@shared/types/game-structures';
import { getLearnedSkillIds } from '@shared/lib/skill-utils';

let cached: ItemDb | null = null;

const ensureInit = (): void => {
  if (!cached) {
    throw new Error('item-db not initialized. Call initItemDb() first.');
  }
};

export const initItemDb = async (): Promise<void> => {
  if (cached) return;
  cached = await window.wydAPI.getItemDb();
};

export const getItemDb = (): ItemDb => {
  ensureInit();
  return cached!;
};

export const getItem = (id: number): Item | undefined => {
  ensureInit();
  return cached!.items.get(id);
};

export const getSkill = (skillId: number): Skill | undefined => {
  ensureInit();
  return cached!.skillsById.get(skillId);
};

export const getSkills = (): ReadonlyMap<number, Skill> => {
  ensureInit();
  return cached!.skillsById;
};

export const getLearnedSkills = (
  learnedSkill: readonly [number, number],
  charClass: ECharClass,
): Skill[] => {
  ensureInit();
  const ids = getLearnedSkillIds(learnedSkill[0], learnedSkill[1], charClass);
  const out: Skill[] = [];
  for (const id of ids) {
    const skill = cached!.skillsById.get(id);
    if (skill) out.push(skill);
  }
  return out;
};
