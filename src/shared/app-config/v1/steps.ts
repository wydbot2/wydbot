import { z } from 'zod';
import {
  UlidSchema,
  MPositionSchema,
  WalkModeSchema,
  InteractTargetSchema,
  FollowTargetSchema,
  ScriptLanguageSchema,
  MarkerNameSchema,
  ScriptNameSchema,
} from './primitives';
import { VALIDATION_MSG, MIN_DELAY_MS, MAX_DELAY_MS } from './messages';

/**
 * Walk step — the player moves to `position`. `exact` mode lands precisely;
 * `approx` jitters within 2 tiles to mask anti-pattern detection.
 */
export const WalkStepSchema = z
  .object({
    id: UlidSchema,
    kind: z.literal('walk'),
    position: MPositionSchema,
    mode: WalkModeSchema,
  })
  .strict();

/**
 * Interact step — the engine walks the player within range of the NPC
 * (resolved by name; when multiple NPCs share the same name, the closest
 * to the player wins) and sends the canonical click packet.
 *
 * No spatial anchor: macros that need to disambiguate roaming NPCs should
 * use a `script` step with `ctx.npcs[i].isWithin(N)` + `goToMarker` to
 * position the player nearby before this step runs.
 */
export const InteractStepSchema = z
  .object({
    id: UlidSchema,
    kind: z.literal('interact'),
    target: InteractTargetSchema,
  })
  .strict();

/**
 * Follow step — the engine walks the player within range of the NPC (resolved
 * by name; closest-to-player wins) and stops, without interacting. Unlike
 * `interact`, it has no capability gate: any NPC category can be followed.
 *
 * No spatial anchor (same as interact): the NPC's live position drives the
 * approach, so there is no fixed coordinate to persist.
 */
export const FollowStepSchema = z
  .object({
    id: UlidSchema,
    kind: z.literal('follow'),
    target: FollowTargetSchema,
  })
  .strict();

/**
 * Script step — persists user source at this point in the sequence. No spatial
 * anchor: runs at the macro's current position, like delay. Execution (ctx
 * shape, sandbox, error handling) lives in the script runtime; this schema
 * only fixes the persisted shape.
 *
 * `name` is unique across all named steps (markers + scripts) — see superRefine.
 */
export const ScriptStepSchema = z
  .object({
    id: UlidSchema,
    kind: z.literal('script'),
    name: ScriptNameSchema,
    language: ScriptLanguageSchema,
    source: z
      .string()
      .min(1, { error: VALIDATION_MSG.scriptSourceLength })
      .max(8192, { error: VALIDATION_MSG.scriptSourceLength }),
  })
  .strict();

/**
 * Delay step — sequential pause for `ms` milliseconds before advancing. No
 * spatial anchor: the player stays where they are, and the engine's
 * skip-distance gate is bypassed for any kind without a position.
 */
export const DelayStepSchema = z
  .object({
    id: UlidSchema,
    kind: z.literal('delay'),
    ms: z
      .number()
      .int()
      .min(MIN_DELAY_MS, { error: VALIDATION_MSG.delayRange })
      .max(MAX_DELAY_MS, { error: VALIDATION_MSG.delayRange }),
  })
  .strict();

/**
 * Marker step — declarative named point in the sequence. No spatial anchor,
 * no side effect: the engine treats it as pass-through (`delayMs: 0`). The
 * `name` is unique across the macro (validated in `MacroConfigV1Schema` via
 * `superRefine`). Future: addressable as a jump target via the script API.
 */
export const MarkerStepSchema = z
  .object({
    id: UlidSchema,
    kind: z.literal('marker'),
    name: MarkerNameSchema,
  })
  .strict();

/** Zone-portal step — active pad center (`ZONE_PORTALS`); wire via macro + main 0x290 gate. */
export const PortalStepSchema = z
  .object({
    id: UlidSchema,
    kind: z.literal('portal'),
    position: MPositionSchema,
  })
  .strict();

export const MacroStepSchema = z.discriminatedUnion('kind', [
  WalkStepSchema,
  InteractStepSchema,
  FollowStepSchema,
  ScriptStepSchema,
  DelayStepSchema,
  MarkerStepSchema,
  PortalStepSchema,
]);

export type MacroStepConfig = z.infer<typeof MacroStepSchema>;
