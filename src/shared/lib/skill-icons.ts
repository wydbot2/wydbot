// shift-band remap as affects (+0x17 in [0x69,0x98], -0x29 in [0x99,0xa8]).
const skillIdToCell = (id: number): number | null => {
  if (!Number.isInteger(id) || id < 0) return null;
  if (id < 0x69) return id;
  if (id < 0x99) return id + 0x17;
  if (id < 0xa9) return id - 0x29;
  return null;
};

const padId = (n: number): string => String(n).padStart(3, '0');

export const getSkillIconUrl = (skillId: number): string | null => {
  const cell = skillIdToCell(skillId);
  if (cell === null) return null;
  return `wydskill://skills/${padId(cell)}.png`;
};
