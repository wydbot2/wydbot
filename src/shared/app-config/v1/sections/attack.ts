import { z } from 'zod';
import {
  MAX_ATTACK_RANGE,
  MAX_DETECTION_RADIUS,
  MAX_GIVEUP_TIMEOUT_SEC,
  MIN_ATTACK_RANGE,
  MIN_DETECTION_RADIUS,
  MIN_GIVEUP_TIMEOUT_SEC,
  ROTATION_SLOT_COUNT,
} from '../../../constants/attack';
import { VALIDATION_MSG } from '../messages';

// Físico = basic auto-attack with weapon. Mágico = skill rotation. Mutually exclusive.
export const AttackModeSchema = z.enum(['physical', 'magical']);
export type AttackMode = z.infer<typeof AttackModeSchema>;

export const RotationSlotSchema = z
  .object({
    skillId: z.number().int().min(0).max(255),
  })
  .strict();
export type RotationSlot = z.infer<typeof RotationSlotSchema>;

// Fixed-length tuple of nullable entries: index = priority - 1.
export const RotationSchema = z
  .object({
    slots: z.array(RotationSlotSchema.nullable()).length(ROTATION_SLOT_COUNT),
  })
  .strict();
export type Rotation = z.infer<typeof RotationSchema>;

export const AttackTargetingSchema = z
  .object({
    detectionRadius: z.number().int().min(MIN_DETECTION_RADIUS).max(MAX_DETECTION_RADIUS),
    // Physical only. Magical derives its range per-skill from SkillData castRange,
    // so a magical config omits this field.
    attackRange: z.number().int().min(MIN_ATTACK_RANGE).max(MAX_ATTACK_RANGE).optional(),
  })
  .strict();
export type AttackTargeting = z.infer<typeof AttackTargetingSchema>;

export const MonsterTargetSchema = z
  .object({
    // .trim() normalizes legacy configs that stored trailing/leading whitespace.
    name: z.string().trim().min(1).max(32),
    // Absent = inherits attack.giveUp.timeoutSec (then DEFAULT_GIVEUP_TIMEOUT_SEC).
    giveUpTimeoutSec: z
      .number()
      .int()
      .min(MIN_GIVEUP_TIMEOUT_SEC)
      .max(MAX_GIVEUP_TIMEOUT_SEC)
      .optional(),
  })
  .strict();
export type MonsterTarget = z.infer<typeof MonsterTargetSchema>;

export const GiveUpSchema = z
  .object({
    timeoutSec: z.number().int().min(MIN_GIVEUP_TIMEOUT_SEC).max(MAX_GIVEUP_TIMEOUT_SEC),
  })
  .strict();
export type GiveUp = z.infer<typeof GiveUpSchema>;

// All sub-fields optional → sparse-save preserved.
// `enabled` is the on/off gate; whitelist required when enabled.
export const AttackSectionSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: AttackModeSchema.optional(),
    targeting: AttackTargetingSchema.optional(),
    rotation: RotationSchema.optional(),
    monsters: z.array(MonsterTargetSchema).max(64).optional(),
    giveUp: GiveUpSchema.optional(),
  })
  .strict()
  .superRefine((attack, ctx) => {
    if (attack.monsters && attack.monsters.length >= 2) {
      // case-insensitive — engine matches MCreateMob.name without case
      const seen = new Set<string>();
      for (let i = 0; i < attack.monsters.length; i++) {
        const key = attack.monsters[i].name.toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['monsters', i, 'name'],
            message: VALIDATION_MSG.duplicateMonster,
          });
        }
        seen.add(key);
      }
    }
    if (attack.enabled && (!attack.monsters || attack.monsters.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['monsters'],
        message: VALIDATION_MSG.attackWhitelistRequired,
      });
    }
  });
export type AttackSection = z.infer<typeof AttackSectionSchema>;
