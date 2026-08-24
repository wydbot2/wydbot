import { z } from 'zod';
import { VALIDATION_MSG } from '../messages';
import { AutoHealingSchema } from './auto-healing';

/**
 * Misc tab sections — extra/auxiliary toggles that don't fit a dedicated tab.
 * Each subsection is optional. Absence in the persisted config means the
 * feature is disabled (its absence carries semantic meaning: "untouched").
 */

export const DeathReturnSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(['continue', 'pause', 'stop', 'restart']),
  })
  .strict();

export type DeathReturnConfig = z.infer<typeof DeathReturnSchema>;
export type DeathReturnMode = DeathReturnConfig['mode'];

export const AutoStackSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

export type AutoStackConfig = z.infer<typeof AutoStackSchema>;

/** Max buff skills selectable for the auto-buff rotation. */
export const MISC_AUTO_BUFF_MAX = 12;

/**
 * Minimum seconds between re-casts of the same buff. Flood guard: many buffs
 * have `cooldownSecs` 0/1 in SkillData.bin, which without a floor makes the
 * auto-buff poll cast every tick (~1s). Recast is gated by
 * `max(recastIntervalSec ?? cooldownSecs, this floor)`.
 */
export const MISC_AUTO_BUFF_RECAST_FLOOR_SEC = 30;

export const AutoBuffSchema = z
  .object({
    enabled: z.boolean(),
    /** Learned buff skill ids, cast in array order. */
    skills: z.array(z.number().int().min(0).max(255)).max(MISC_AUTO_BUFF_MAX),
    /** Recast interval (s). Absent ⇒ fall back to each skill's cooldownSecs. */
    recastIntervalSec: z.number().int().min(1).max(3600).optional(),
  })
  .strict();

export type AutoBuffConfig = z.infer<typeof AutoBuffSchema>;

/**
 * Fixed recast interval for the auto-summon — mirrors the canonical dedicated
 * a lower value flickers the pet, a higher one leaves it expired.
 */
export const MISC_AUTO_SUMMON_RECAST_SEC = 80;

export const AutoSummonSchema = z
  .object({
    enabled: z.boolean(),
    /** Learned summon skill id — one active summon at a time; null = none chosen. */
    skill: z.number().int().min(0).max(255).nullable(),
  })
  .strict();

export type AutoSummonConfig = z.infer<typeof AutoSummonSchema>;

export const MISC_AUTO_DROP_MAX_RULES = 200;
export const MISC_AUTO_DROP_MAX_ATTRS_PER_GROUP = 10;
export const MISC_AUTO_DROP_MAX_GROUPS_PER_SIDE = 5;

/**
 * Predicate against one of the dropped item's wire effects (`MItem.effects`).
 * `index` is the numeric effect id (canonical, mirrors `MItemDefinition`).
 * Missing effect on the item is treated as value 0 at match time.
 * `absent`/`present` test ADD presence only — `value` is ignored for them.
 */
const AutoDropAttrSchema = z
  .object({
    index: z.number().int().min(0).max(255),
    op: z.enum(['>=', '>', '=', '<', '<=', 'absent', 'present']),
    value: z.number().int(),
  })
  .strict();

/** Attribute group — predicates ANDed together at match time. */
const AutoDropAttrGroupSchema = z.array(AutoDropAttrSchema).max(MISC_AUTO_DROP_MAX_ATTRS_PER_GROUP);

const AutoDropRuleSchema = z
  .object({
    /** Single item id this rule targets (one item per rule). */
    itemId: z.number().int().min(1).max(0x1963),
    /**
     * Delete side: OR of AND groups — the item is a drop candidate when ANY
     * group fully matches. Empty list ⇒ "qualquer instância" do item.
     */
    dropGroups: z.array(AutoDropAttrGroupSchema).max(MISC_AUTO_DROP_MAX_GROUPS_PER_SIDE),
    /**
     * Veto side: OR of AND groups with priority over `dropGroups` — when ANY
     * group fully matches, the item is KEPT (e.g. SPECIALALL >= 39 protects a
     * high learning roll). Empty/absent ⇒ no protection.
     */
    keepGroups: z.array(AutoDropAttrGroupSchema).max(MISC_AUTO_DROP_MAX_GROUPS_PER_SIDE).optional(),
  })
  .strict();

export const AutoDropSchema = z
  .object({
    enabled: z.boolean(),
    /** Blacklist: an item is a drop candidate iff it matches ANY rule. */
    rules: z.array(AutoDropRuleSchema).max(MISC_AUTO_DROP_MAX_RULES),
  })
  .strict()
  .superRefine((autoDrop, ctx) => {
    const seen = new Set<number>();
    for (let i = 0; i < autoDrop.rules.length; i++) {
      const { itemId } = autoDrop.rules[i];
      if (seen.has(itemId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rules', i, 'itemId'],
          message: VALIDATION_MSG.duplicateAutoDropItem,
        });
      }
      seen.add(itemId);
    }
  });

export type AutoDropConfig = z.infer<typeof AutoDropSchema>;
export type AutoDropRule = z.infer<typeof AutoDropRuleSchema>;
export type AutoDropAttr = z.infer<typeof AutoDropAttrSchema>;
export type AutoDropAttrOp = AutoDropAttr['op'];

/** Max whitelisted players for the auto-party. */
export const MISC_AUTO_GROUP_MAX_MEMBERS = 32;

export const AutoGroupMemberSchema = z
  .object({
    // .trim() normalizes legacy configs that stored trailing/leading whitespace.
    name: z.string().trim().min(1).max(32),
  })
  .strict();
export type AutoGroupMember = z.infer<typeof AutoGroupMemberSchema>;

export const AutoGroupSchema = z
  .object({
    enabled: z.boolean(),
    // Mutually exclusive: lead the party (invite whitelisted nearby) OR accept invites from them.
    mode: z.enum(['leader', 'accept']),
    whitelist: z.array(AutoGroupMemberSchema).max(MISC_AUTO_GROUP_MAX_MEMBERS),
  })
  .strict()
  .superRefine((autoGroup, ctx) => {
    // case-insensitive — engine matches OtherPlayer.name without case
    const seen = new Set<string>();
    for (let i = 0; i < autoGroup.whitelist.length; i++) {
      const key = autoGroup.whitelist[i].name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['whitelist', i, 'name'],
          message: VALIDATION_MSG.duplicateGroupMember,
        });
      }
      seen.add(key);
    }
  });
export type AutoGroupConfig = z.infer<typeof AutoGroupSchema>;
export type AutoGroupMode = AutoGroupConfig['mode'];

export const MiscSectionSchema = z
  .object({
    /** "Voltar à cidade após morte" — controls macro reaction on player death. */
    deathReturn: DeathReturnSchema.optional(),
    /** "Agrupamento de itens" — auto-consolidate same-item partial stacks. */
    autoStack: AutoStackSchema.optional(),
    /** "Auto Buff" — auto-cast selected learned buff skills. */
    autoBuff: AutoBuffSchema.optional(),
    /** "Auto Summon" — re-summon the chosen pet on the canonical 80 s timer. */
    autoSummon: AutoSummonSchema.optional(),
    /** "Auto Drop" — blacklist auto-discard of incoming bag items. */
    autoDrop: AutoDropSchema.optional(),
    /** "Auto Healing" — alimentação de montaria + HP/MP (skill+item) + cura de debuff. */
    autoHealing: AutoHealingSchema.optional(),
    /** "Auto Grupo" — lidera/aceita grupo com jogadores da whitelist. */
    autoGroup: AutoGroupSchema.optional(),
  })
  .strict();

export type MiscSection = z.infer<typeof MiscSectionSchema>;
