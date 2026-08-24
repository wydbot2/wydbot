import { z } from 'zod';

/**
 * Auto Healing — Misc tab section.
 *
 * Composição:
 *   - `mountFeed`  — alimentação automática de montaria (% threshold 30..90)
 *   - `hp`         — recuperação de HP (item OU skill, lista de fallback)
 *   - `mp`         — recuperação de MP (apenas itens — canônico não auto-casta skill de MP)
 *   - `debuffCure` — cura automática de debuff (event-triggered, sem threshold)
 *
 * Cada sub-feature armazena suas escolhas como `actions: Array<HealAction>`
 * — uma lista ordenada de fallback. O ambient module tenta cada ação na ordem
 * (primeiro skill off-CDR vence; senão primeiro item off-CDR + presente em
 * inventário). MP rejeita `kind: 'skill'` no schema (decisão de produto #1).
 * Mount-feed actions são preferências do usuário
 *
 * Master `enabled` é kill-switch global; sub-features têm `enabled` próprio
 * para gate independente. Sub-configs persistem mesmo com master OFF.
 */

const HEAL_ACTION_MAX_PER_RULE = 8;
export const AUTO_HEALING_MAX_ACTIONS = HEAL_ACTION_MAX_PER_RULE;

const HealItemActionSchema = z
  .object({
    kind: z.literal('item'),
    refId: z.number().int().min(1).max(0x1963),
  })
  .strict();

const HealSkillActionSchema = z
  .object({
    kind: z.literal('skill'),
    refId: z.number().int().min(0).max(255),
  })
  .strict();

/** Item OR skill — used by HP, mountFeed, debuffCure. */
export const HealActionSchema = z.discriminatedUnion('kind', [
  HealItemActionSchema,
  HealSkillActionSchema,
]);

export type HealAction = z.infer<typeof HealActionSchema>;

export const AutoHealingMountFeedSchema = z
  .object({
    enabled: z.boolean(),
    thresholdPct: z.number().int().min(30).max(90),
    actions: z.array(HealActionSchema).max(HEAL_ACTION_MAX_PER_RULE),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.enabled && cfg.actions.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Auto-alimentação de montaria habilitada requer ao menos uma ração.',
      });
    }
  });

export type AutoHealingMountFeedConfig = z.infer<typeof AutoHealingMountFeedSchema>;

/** HP auto-recovery. Fallback list — primeira skill off-CDR vence, senão primeiro item off-CDR + no bag. */
export const AutoHealingHpSchema = z
  .object({
    enabled: z.boolean(),
    thresholdPct: z.number().int().min(1).max(99),
    actions: z.array(HealActionSchema).max(HEAL_ACTION_MAX_PER_RULE),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.enabled && cfg.actions.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Auto-HP habilitado requer ao menos uma ação (skill ou item).',
      });
    }
  });

export type AutoHealingHpConfig = z.infer<typeof AutoHealingHpSchema>;

/** MP auto-recovery. **Apenas itens** — schema rejeita `kind: 'skill'`. */
export const AutoHealingMpSchema = z
  .object({
    enabled: z.boolean(),
    thresholdPct: z.number().int().min(1).max(99),
    actions: z.array(HealItemActionSchema).max(HEAL_ACTION_MAX_PER_RULE),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.enabled && cfg.actions.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Auto-MP habilitado requer ao menos um item.',
      });
    }
  });

export type AutoHealingMpConfig = z.infer<typeof AutoHealingMpSchema>;

/** Debuff cure. Event-triggered (não usa threshold) — dispara quando affect curável presente. */
export const AutoHealingDebuffCureSchema = z
  .object({
    enabled: z.boolean(),
    actions: z.array(HealActionSchema).max(HEAL_ACTION_MAX_PER_RULE),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.enabled && cfg.actions.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Auto-cura de debuff habilitada requer ao menos uma ação (skill ou erva).',
      });
    }
  });

export type AutoHealingDebuffCureConfig = z.infer<typeof AutoHealingDebuffCureSchema>;

/** Master schema. Sub-features são opcionais (omissão ⇒ feature nunca tocada). */
export const AutoHealingSchema = z
  .object({
    enabled: z.boolean(),
    mountFeed: AutoHealingMountFeedSchema.optional(),
    hp: AutoHealingHpSchema.optional(),
    mp: AutoHealingMpSchema.optional(),
    debuffCure: AutoHealingDebuffCureSchema.optional(),
  })
  .strict();

export type AutoHealingConfig = z.infer<typeof AutoHealingSchema>;
