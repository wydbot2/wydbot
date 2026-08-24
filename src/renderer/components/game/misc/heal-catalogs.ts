/**
 * Catalogs + filters for Auto Healing pickers.
 *
 * Reuses `SkillCatalogEntry` from `attack-catalog.ts` so `SkillPickerModal`
 * works as-is. Item filters match canonical id-ranges + category gates.
 */

import type { ECharClass } from '@shared/types/game-structures';
import type { Item } from '@shared/types/item-db-types';
import { getLearnedSkills, getSkill } from '../../../lib/item-db';
import type { SkillCatalogEntry } from '../attack/attack-catalog';

/** Skill ids selectable for HP auto-heal. */
const HP_HEAL_SKILL_IDS = new Set<number>([
  0x1b, // Cura — single-target heal (self or ally)
  0x1d, // Recuperar — self + party heal
]);

/** Skill ids selectable for debuff-cure. */
const CURE_SKILL_IDS = new Set<number>([
  0x19, // Desintoxicar
]);

const inRange = (id: number, lo: number, hi: number): boolean => id >= lo && id <= hi;

/** Canonical HP-potion id ranges. */
const isHpPotion = (id: number): boolean =>
  inRange(id, 0x190, 0x194) ||
  inRange(id, 0x1ac, 0x1af) ||
  inRange(id, 0x2a8, 0x2ad) ||
  id === 0xd67 ||
  id === 0xcfa;

/** Canonical MP-potion id ranges. */
const isMpPotion = (id: number): boolean =>
  inRange(id, 0x195, 0x199) ||
  inRange(id, 0x1b0, 0x1b3) ||
  inRange(id, 0x2ae, 0x2b3) ||
  id === 0xcfb;

/** Erva de Cura (id 415) — v1 single supported herb. */
const HERB_ITEM_IDS = new Set<number>([415]);

export interface HealItemFilter {
  (item: Item): boolean;
}

export const HP_ITEM_FILTER: HealItemFilter = (it) => isHpPotion(it.id);
export const MP_ITEM_FILTER: HealItemFilter = (it) => isMpPotion(it.id);
export const HERB_ITEM_FILTER: HealItemFilter = (it) => HERB_ITEM_IDS.has(it.id);

/** Generic learned-skill → picker-entry builder; also consumed by `summon-catalog.ts`. */
export const buildSkillCatalog = (
  learnedSkill: readonly [number, number],
  charClass: ECharClass,
  predicate: (skillId: number) => boolean,
): SkillCatalogEntry[] => {
  const out: SkillCatalogEntry[] = [];
  for (const s of getLearnedSkills(learnedSkill, charClass)) {
    if (!predicate(s.id) || s.name === null) continue;
    out.push({ id: s.id, name: s.name, iconUrl: s.iconUrl, cooldownSecs: s.row.cooldownSecs });
  }
  return out;
};

export const buildHpHealSkillCatalog = (
  learnedSkill: readonly [number, number],
  charClass: ECharClass,
): SkillCatalogEntry[] =>
  buildSkillCatalog(learnedSkill, charClass, (id) => HP_HEAL_SKILL_IDS.has(id));

export const buildCureSkillCatalog = (
  learnedSkill: readonly [number, number],
  charClass: ECharClass,
): SkillCatalogEntry[] =>
  buildSkillCatalog(learnedSkill, charClass, (id) => CURE_SKILL_IDS.has(id));

/** Resolve a single persisted skill id to a `SkillCatalogEntry` (or null). */
export const resolveSkillEntry = (skillId: number | undefined): SkillCatalogEntry | null => {
  if (skillId === undefined) return null;
  const skill = getSkill(skillId);
  if (!skill || skill.name === null) return null;
  return {
    id: skill.id,
    name: skill.name,
    iconUrl: skill.iconUrl,
    cooldownSecs: skill.row.cooldownSecs,
  };
};
