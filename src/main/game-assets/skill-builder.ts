import type { Skill, SkillRow } from '@shared/types/skill-types';
import { getSkillIconUrl } from '@shared/lib/skill-icons';

export const buildSkill = (row: SkillRow, skillNameBand: ReadonlyMap<number, string>): Skill => ({
  id: row.id,
  name: skillNameBand.get(row.id) ?? null,
  iconUrl: getSkillIconUrl(row.id),
  row,
});
