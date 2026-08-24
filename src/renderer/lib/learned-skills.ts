import { getLearnedSkillIds } from '@shared/lib/skill-utils';
import type { ECharClass } from '@shared/types/game-structures';
import { usePlayerStore } from '../stores/player-store';

/**
 * Learned skill ids for the logged-in character, or `undefined` before login —
 * when the learned set is still unknown an empty set would wrongly gate
 * everything. Runtime gate: features only act on ids present in the set.
 */
export const getLearnedSkillGate = (): Set<number> | undefined => {
  const { learnedSkill, charClass } = usePlayerStore.getState();
  if (learnedSkill[0] === 0 && learnedSkill[1] === 0) return undefined;
  return new Set(getLearnedSkillIds(learnedSkill[0], learnedSkill[1], charClass as ECharClass));
};
