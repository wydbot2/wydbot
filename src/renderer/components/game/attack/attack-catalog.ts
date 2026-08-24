import type { Rotation } from '@shared/app-config';
import { ROTATION_SLOT_COUNT } from '@shared/constants/attack';
import type { ECharClass } from '@shared/types/game-structures';
import { getLearnedSkills, getSkill } from '../../../lib/item-db';
import type { SkillSlot } from './SkillRotationRow';

export interface SkillCatalogEntry {
  id: number;
  name: string;
  iconUrl: string | null;
  /** Base cooldown in seconds — pre-runtime reductions (level bucket, mount). */
  cooldownSecs: number;
}

export const buildSkillCatalog = (
  learnedSkill: readonly [number, number],
  charClass: ECharClass,
): SkillCatalogEntry[] => {
  const out: SkillCatalogEntry[] = [];
  for (const s of getLearnedSkills(learnedSkill, charClass)) {
    if (s.row.hitsEnemies !== 1 || s.name === null) continue;
    out.push({ id: s.id, name: s.name, iconUrl: s.iconUrl, cooldownSecs: s.row.cooldownSecs });
  }
  return out;
};

export const projectRotationSlots = (
  rotation: Rotation | undefined,
  catalog: readonly SkillCatalogEntry[],
  cooldowns: Readonly<Record<number, number>> = {},
): SkillSlot[] =>
  Array.from({ length: ROTATION_SLOT_COUNT }, (_, i) => {
    const persisted = rotation?.slots[i];
    if (!persisted) return { priority: i + 1, skill: null, cooldownEndsMs: null };
    const cooldownEndsMs = cooldowns[persisted.skillId] ?? null;
    const entry = catalog.find((s) => s.id === persisted.skillId);
    if (entry) {
      return {
        priority: i + 1,
        skill: { id: entry.id, name: entry.name, iconUrl: entry.iconUrl },
        cooldownEndsMs,
      };
    }
    const skill = getSkill(persisted.skillId);
    return {
      priority: i + 1,
      skill:
        skill && skill.name !== null
          ? { id: skill.id, name: skill.name, iconUrl: skill.iconUrl }
          : null,
      cooldownEndsMs,
    };
  });
