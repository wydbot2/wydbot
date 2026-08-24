import { z } from 'zod';
import type { MPosition, NpcCategory } from '@shared/types';
import {
  VALIDATION_MSG,
  MARKER_NAME_MAX,
  MARKER_NAME_REGEX,
  MAX_ITEM_ID,
  BANK_RULE_MAX,
  COMPOSE_ACTION_MAX,
  SHOP_RULE_MAX,
} from './messages';

/**
 * ULID — 26-char Crockford base32, lexicographically sortable.
 * Stable across sessions (unlike the runtime counter in macro-store.ts).
 */
export const UlidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, { error: VALIDATION_MSG.ulidFormat });

/**
 * World coordinate — WYD2 uses a unified 4096×4096 space.
 * Typed as `z.ZodType<MPosition>` so the runtime schema stays in lock-step
 * with the compile-time type from `@shared/types`.
 */
export const MPositionSchema: z.ZodType<MPosition> = z.object({
  x: z
    .number()
    .int()
    .min(0, { error: VALIDATION_MSG.positionOutOfBounds })
    .max(4095, { error: VALIDATION_MSG.positionOutOfBounds }),
  y: z
    .number()
    .int()
    .min(0, { error: VALIDATION_MSG.positionOutOfBounds })
    .max(4095, { error: VALIDATION_MSG.positionOutOfBounds }),
});

/** Walk mode — 'exact' lands precisely, 'approx' jitters within 2 world units. */
export const WalkModeSchema = z.enum(['exact', 'approx']);

/** NPC display name — 1..64 chars; shared by the simple-NPC and bank targets. */
const NpcNameSchema = z
  .string()
  .min(1, { error: VALIDATION_MSG.npcNameLength })
  .max(64, { error: VALIDATION_MSG.npcNameLength });

/** Bank deposit/withdraw rule — items move whole-stack (no count); gold carries an amount. */
export const BankRuleSchema = z
  .object({
    direction: z.enum(['deposit', 'withdraw']),
    target: z.enum(['item', 'gold']),
    itemId: z.number().int().min(1).max(MAX_ITEM_ID).optional(),
    amount: z.number().int().min(1).optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.target === 'item' && rule.itemId === undefined) {
      ctx.addIssue({ code: 'custom', message: VALIDATION_MSG.bankRuleItemRequiresId });
    }
    if (rule.target === 'gold' && rule.amount === undefined) {
      ctx.addIssue({ code: 'custom', message: VALIDATION_MSG.bankRuleGoldRequiresAmount });
    }
  });

export type BankRule = z.infer<typeof BankRuleSchema>;

/** One ingredient a compose recipe consumes — item id + quantity (display/echo of the recipe). */
export const ComposeIngredientSchema = z
  .object({
    itemId: z.number().int().min(1).max(MAX_ITEM_ID),
    qty: z.number().int().min(1),
  })
  .strict();

export type ComposeIngredient = z.infer<typeof ComposeIngredientSchema>;

/** A persisted compose action — the recipe id sent on the wire (0x2e7) plus display/echo data. */
export const ComposeActionSchema = z
  .object({
    recipeIndex: z.number().int().min(0),
    label: z.string().min(1).max(64),
    menuPath: z.array(z.string().max(64)).max(8),
    ingredients: z.array(ComposeIngredientSchema).max(8),
  })
  .strict();

export type ComposeAction = z.infer<typeof ComposeActionSchema>;

/** Shop buy rule — item id + quantity to purchase from the merchant NPC. */
export const ShopRuleSchema = z
  .object({
    itemId: z.number().int().min(1).max(MAX_ITEM_ID),
    quantity: z.number().int().min(1).max(99),
  })
  .strict();

export type ShopRule = z.infer<typeof ShopRuleSchema>;

/**
 * Shop panel open C2S proven at probe: `dialog` = 0x27b, `npc` = 0x28b.
 * Default `dialog` for legacy JSON without the field.
 */
export const ShopOpenSchema = z.enum(['dialog', 'npc']);

export type ShopOpen = z.infer<typeof ShopOpenSchema>;

/** Optional display chip only — not runtime service SoT. */
export const NpcCategorySchema = z.enum([
  'bank',
  'shop',
  'learn',
  'menupopup',
  'portal',
  'compose',
  'unknown',
]) satisfies z.ZodType<NpcCategory>;

/**
 * Interact target. Service SoT is the payload (`bank` / `compose` / `shop`);
 * at most one service payload. `npcCategory` is optional UI residue.
 */
export const InteractTargetSchema = z
  .object({
    npcName: NpcNameSchema,
    npcCategory: NpcCategorySchema.optional(),
    bank: z
      .object({
        rules: z.array(BankRuleSchema).max(BANK_RULE_MAX, { error: VALIDATION_MSG.bankRulesMax }),
        depositFullStackOnly: z.boolean().optional(),
      })
      .strict()
      .optional(),
    compose: z
      .object({
        actions: z
          .array(ComposeActionSchema)
          .max(COMPOSE_ACTION_MAX, { error: VALIDATION_MSG.composeActionsMax }),
      })
      .strict()
      .optional(),
    shop: z
      .object({
        rules: z.array(ShopRuleSchema).max(SHOP_RULE_MAX, { error: VALIDATION_MSG.shopRulesMax }),
        /** Probe-proven open path; default for legacy saves. */
        open: ShopOpenSchema.default('dialog'),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((target, ctx) => {
    const n = (target.bank ? 1 : 0) + (target.compose ? 1 : 0) + (target.shop ? 1 : 0);
    if (n > 1) {
      ctx.addIssue({
        code: 'custom',
        message: VALIDATION_MSG.interactSingleService,
      });
    }
  });

export type InteractTarget = z.infer<typeof InteractTargetSchema>;

/** Follow target — only the NPC name; the engine walks within range without interacting (works for any NPC category). */
export const FollowTargetSchema = z
  .object({
    npcName: NpcNameSchema,
  })
  .strict();

export type FollowTarget = z.infer<typeof FollowTargetSchema>;

/** Script language — reserved enum; only 'js' ships in v1. */
export const ScriptLanguageSchema = z.enum(['js']);

/**
 * Marker name shape — uppercase identifier used to label a named point in the
 * macro sequence. Letter-led, only A-Z + 0-9 with `_` as separator. The regex
 * rejects double underscores, leading/trailing underscores, and digit-led
 * names. Cross-step uniqueness is enforced at config level via `superRefine`.
 */
export const MarkerNameSchema = z
  .string()
  .min(1, { error: VALIDATION_MSG.markerLength })
  .max(MARKER_NAME_MAX, { error: VALIDATION_MSG.markerLength })
  .regex(MARKER_NAME_REGEX, { error: VALIDATION_MSG.markerRegex });

/** Same regex/length as marker — separate schema for precise error messages. */
export const ScriptNameSchema = z
  .string()
  .min(1, { error: VALIDATION_MSG.scriptNameLength })
  .max(MARKER_NAME_MAX, { error: VALIDATION_MSG.scriptNameLength })
  .regex(MARKER_NAME_REGEX, { error: VALIDATION_MSG.scriptNameRegex });
