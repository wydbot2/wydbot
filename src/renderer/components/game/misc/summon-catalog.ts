import type { ECharClass } from '@shared/types/game-structures';
import { SUMMON_TYPE_CODES } from '@shared/lib/skill-classifier';
import type { SkillCatalogEntry } from '../attack/attack-catalog';
import { buildSkillCatalog, resolveSkillEntry } from './heal-catalogs';

/** Learned skills filtered to summon candidates only ("Evocar" line). */
export const buildSummonCatalog = (
  learnedSkill: readonly [number, number],
  charClass: ECharClass,
): SkillCatalogEntry[] =>
  buildSkillCatalog(learnedSkill, charClass, (id) => SUMMON_TYPE_CODES.has(id));

/** Resolve the persisted summon id to a display entry (unknown id → null). */
export const resolveSummonSkill = (skillId: number | null): SkillCatalogEntry | null =>
  resolveSkillEntry(skillId ?? undefined);
