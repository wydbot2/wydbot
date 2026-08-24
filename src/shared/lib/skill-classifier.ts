import type { Skill } from '@shared/types/skill-types';

export const BUFF_TYPE_CODES: ReadonlySet<number> = new Set([
  0x03, 0x05, 0x09, 0x0b, 0x0d, 0x25, 0x29, 0x2b, 0x2c, 0x2d, 0x2e, 0x35, 0x36, 0x40, 0x42, 0x44,
  0x46, 0x47, 0x4b, 0x4c, 0x4d, 0x51, 0x55, 0x57, 0x59, 0x5c, 0x82,
]);

export const SKILL_TYPE_LIMITE_DA_ALMA = 0x66;

/**
 * Summon skills ("Evocar" line) — dedicated autocast branch at
 * single-pick Auto Summon feature (one active pet at a time), never as buffs.
 */
export const SUMMON_TYPE_CODES: ReadonlySet<number> = new Set([
  0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f,
]);

/**
 * Auto-buff candidate iff the native client's buff rotation auto-buffs it: in
 * the 27-code rotation buff set or `0x66`. `selfOnly==1` is NOT a buff signal —
 * it also covers self-heal (Recuperar) and self-teleport (Teleporte). Summons
 * (`SUMMON_TYPE_CODES`) are the third autocast branch and are surfaced as the
 * separate single-pick Auto Summon feature, never here.
 */
export const isBuffSkill = (skill: Skill): boolean =>
  skill.name !== null && (BUFF_TYPE_CODES.has(skill.id) || skill.id === SKILL_TYPE_LIMITE_DA_ALMA);
