import { AFFECT_TYPE_TO_SKILL, SHIELD_GROUP_CAST_TYPES } from '@shared/constants/affect-skill-lut';

/**
 * given the player's affect-table entries? An entry suppresses recast when its
 * LUT-mapped skill type equals the cast type (or `0x47` for the shield group)
 * and it still has time. `affects` are `{ type, timeOctets }` (0x336 Compact).
 */
export const isCastTypeActive = (
  castType: number,
  affects: readonly { type: number; timeOctets: number }[],
): boolean => {
  const target = SHIELD_GROUP_CAST_TYPES.has(castType) ? 0x47 : castType;
  for (const a of affects) {
    if (a.timeOctets === 0) continue;
    if (AFFECT_TYPE_TO_SKILL[a.type] === target) return true;
  }
  return false;
};
