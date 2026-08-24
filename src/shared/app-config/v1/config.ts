import { z } from 'zod';
import { pt } from 'zod/v4/locales';
import { MacroStepSchema } from './steps';
import { MiscSectionSchema } from './sections/misc';
import { AttackSectionSchema } from './sections/attack';
import { VALIDATION_MSG } from './messages';

// Default Zod messages (fields without an explicit VALIDATION_MSG) render in pt-BR
// instead of English. Custom `{ error: ... }` args still take precedence.
z.config(pt());

/**
 * Root schema for persisted app configs, version 1.
 *
 * - `version` is a literal so future versions (v2, v3) can discriminate at parse time
 *   without breaking v1 files.
 * - `strict()` rejects unknown fields to catch typos (e.g. `skill` vs `skills`) early.
 * - All sections are optional — a config with only `version` + `name` is valid
 *   (corresponds to an empty profile with everything at defaults / disabled).
 * - `steps`, when present, must have ≥2 entries (engine invariant) and unique IDs;
 *   marker and script steps share a single name namespace (uniqueness across
 *   both kinds). Validated via `superRefine`.
 *
 * Sections:
 * - `steps` — sequential cavebot route (optional)
 * - `attack` — Ataque tab config (rotation slots, monsters, melee, give-up rule)
 * - `misc` — Misc tab toggles (death-respawn, etc.)
 * - Survival/combat extras live under `attack` and `misc` (autoHealing, autoBuff, …).
 *   Ground loot is not a config section — the game auto-picks drops.
 *
 * "Sparse" save: sections never touched by the user are omitted from the JSON.
 * Section presence in the in-memory config IS the serialization decision —
 * `JSON.stringify(config)` does the right thing without per-section dirty bits.
 */
export const AppConfigV1Schema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(120),
    steps: z.array(MacroStepSchema).max(1024).optional(),
    attack: AttackSectionSchema.optional(),
    misc: MiscSectionSchema.optional(),
    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (!cfg.steps) return;
    if (cfg.steps.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps'],
        message: VALIDATION_MSG.stepsAtLeastTwo,
      });
    }
    const ids = cfg.steps.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps'],
        message: VALIDATION_MSG.duplicateStepId,
      });
    }
    // Unified namespace: marker.name and script.name share one Set.
    const namedSteps = new Set<string>();
    for (let i = 0; i < cfg.steps.length; i++) {
      const step = cfg.steps[i];
      if (step.kind !== 'marker' && step.kind !== 'script') continue;
      if (namedSteps.has(step.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', i, 'name'],
          message: VALIDATION_MSG.duplicateNamedStep,
        });
      }
      namedSteps.add(step.name);
    }
  });

export type AppConfigV1 = z.infer<typeof AppConfigV1Schema>;
