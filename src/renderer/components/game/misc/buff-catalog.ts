import type { ECharClass } from '@shared/types/game-structures';
import { isBuffSkill } from '@shared/lib/skill-classifier';
import { getLearnedSkills, getSkill } from '../../../lib/item-db';
import type { SkillCatalogEntry } from '../attack/attack-catalog';

/**
 * Learned skills filtered to auto-buff candidates only. Mirrors
 * `attack-catalog.ts:buildSkillCatalog`, swapping the `hitsEnemies === 1`
 * attack filter for {@link isBuffSkill}. Shares `SkillCatalogEntry` so the
 * `SkillPickerModal` can be reused as-is.
 */
export const buildBuffCatalog = (
  learnedSkill: readonly [number, number],
  charClass: ECharClass,
): SkillCatalogEntry[] => {
  const out: SkillCatalogEntry[] = [];
  for (const s of getLearnedSkills(learnedSkill, charClass)) {
    if (!isBuffSkill(s) || s.name === null) continue;
    out.push({ id: s.id, name: s.name, iconUrl: s.iconUrl, cooldownSecs: s.row.cooldownSecs });
  }
  return out;
};

/** Resolve persisted skill ids to display entries, dropping unknown ids. */
export const resolveBuffSkills = (
  skillIds: readonly number[],
  catalog: readonly SkillCatalogEntry[],
): SkillCatalogEntry[] =>
  skillIds.flatMap((id) => {
    const entry = catalog.find((s) => s.id === id);
    if (entry) return [entry];
    const skill = getSkill(id);
    return skill && skill.name !== null
      ? [
          {
            id: skill.id,
            name: skill.name,
            iconUrl: skill.iconUrl,
            cooldownSecs: skill.row.cooldownSecs,
          },
        ]
      : [];
  });
