import type { ECharClass } from '@shared/types/game-structures';

export const getLearnedSkillIds = (
  learn0: number,
  learn1: number,
  charClass: ECharClass,
): number[] => {
  const learned: number[] = [];
  const classOffset = charClass * 24;

  for (let i = 0; i < 24; i++) {
    if (learn0 & (1 << i)) learned.push(classOffset + i);
  }

  for (let id = 96; id <= 103; id++) {
    if (learn0 & (1 << (id - 72))) learned.push(id);
  }

  if (learn1 & 0x020) learned.push(205);
  if (learn1 & 0x200) learned.push(233);
  if (learn1 & 0x004) learned.push(238);

  for (let id = 200; id < 247; id++) {
    if (id === 240) continue;
    const shift = (Math.floor((id - 200) / 4) * 4) & 0x1f;
    if (learn1 & (1 << shift)) learned.push(id);
  }

  return learned;
};

// bits are checked as `id % 24`, without class offset). Use this for gameplay
// predicates (cap gates); getLearnedSkillIds is for per-class display catalogs.
export const hasLearnedSkillBit = (
  learnedSkill: readonly [number, number],
  id: number,
): boolean => {
  const [learn0, learn1] = learnedSkill;
  if (id < 96) return (learn0 & (1 << (id % 24))) !== 0;
  if (id <= 103) return (learn0 & (1 << (id - 72))) !== 0;
  if (id === 205) return (learn1 & 0x020) !== 0;
  if (id === 233) return (learn1 & 0x200) !== 0;
  if (id === 238) return (learn1 & 0x004) !== 0;
  if (id >= 200 && id < 247 && id !== 240) {
    const shift = (Math.floor((id - 200) / 4) * 4) & 0x1f;
    return (learn1 & (1 << shift)) !== 0;
  }
  return false;
};
