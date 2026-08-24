import type { MPosition } from '@shared/types';
import { chebyshev } from '@shared/lib/movement-math';
import {
  MarkerNameSchema,
  ScriptNameSchema,
  VALIDATION_MSG,
  hasNamedStepConflict,
} from '@shared/app-config';
import { MAX_STEP_DISTANCE, TELEPORT_THRESHOLD } from '@shared/constants/movement';
import { findPortalAt, findPortalByCenter } from '@shared/constants/zone-portals';
import type { MacroStep, MacroStepKind, StepDraft } from '../stores/macro-types';
import { getStepAnchor } from '../stores/macro-labels';
import { getWalkabilityService } from './walkability-service';

/**
 * Step creation-time validators — paired with `STEP_HANDLERS` in macro-engine.ts.
 *
 * The engine has `Record<MacroStepKind, ActionHandler>` for execution dispatch;
 * this file is the equivalent for creation-time validation. Adding a new kind
 * requires registering an entry here, otherwise TypeScript fails to compile.
 *
 * Validators return `{ ok, message }` — `message` is pt-BR ready for the toast
 * layer, sourced either from a Zod issue or from `VALIDATION_MSG` constants.
 */

export type ValidationResult = { ok: true; warning?: string } | { ok: false; message: string };

export interface ValidationContext {
  /** Steps preceding the draft — used by walk/interact for path continuity. */
  steps: MacroStep[];
  /** All other steps in the macro (excluding the draft itself) — used by marker for cross-step uniqueness. */
  siblings: MacroStep[];
  playerPos: MPosition;
}

type StepValidator = (draft: StepDraft, ctx: ValidationContext) => ValidationResult;

/** Walks the steps list backwards and returns the most recent spatial anchor. */
const getLastAnchor = (steps: MacroStep[], fallback: MPosition): MPosition => {
  for (let i = steps.length - 1; i >= 0; i--) {
    const anchor = getStepAnchor(steps[i]);
    if (anchor) return anchor;
  }
  return fallback;
};

/**
 * Coordinate-only bounds (matches the original `canWalk` `isInBounds`).
 * Kept separate from the walkability-service sentinel check so we don't
 * conflate "OOB by world coord" with "in-bounds tile flagged impassable",
 * preserving the exact pt-BR message mapping (positionOutOfBounds vs walkBlocked).
 */
const isInBounds = (p: MPosition): boolean => p.x >= 0 && p.x <= 4095 && p.y >= 0 && p.y <= 4095;

const validateWalk: StepValidator = (draft, ctx) => {
  if (draft.kind !== 'walk') return { ok: true };
  const from = getLastAnchor(ctx.steps, ctx.playerPos);
  const dist = chebyshev(from, draft.position);

  // Teleport-distance: skip gates; minimap also breaks the route line here.
  if (dist > TELEPORT_THRESHOLD) {
    return { ok: true, warning: VALIDATION_MSG.walkTeleportSuspected(dist) };
  }

  // Mirror canWalk order exactly: bounds → too_far → blocked_dest.
  if (!isInBounds(from) || !isInBounds(draft.position)) {
    return { ok: false, message: VALIDATION_MSG.positionOutOfBounds };
  }

  if (dist > MAX_STEP_DISTANCE) {
    return { ok: false, message: VALIDATION_MSG.walkTooFar };
  }

  const svc = getWalkabilityService();
  if (!svc.canStep(from.x, from.y, draft.position.x, draft.position.y)) {
    return { ok: false, message: VALIDATION_MSG.walkBlocked };
  }

  return { ok: true };
};

/** No-op: range enforced by `DelayStepSchema.ms`. */
const validateDelay: StepValidator = () => ({ ok: true });

/** Source validation is delegated to the runtime — host-side parsing would defeat the WASM sandbox. */
const validateScript: StepValidator = (draft, ctx) => {
  if (draft.kind !== 'script') return { ok: true };
  const r = ScriptNameSchema.safeParse(draft.name);
  if (!r.success) {
    return { ok: false, message: r.error.issues[0].message };
  }
  if (hasNamedStepConflict(ctx.siblings, draft.name)) {
    return { ok: false, message: VALIDATION_MSG.duplicateNamedStep };
  }
  return { ok: true };
};

const validateMarker: StepValidator = (draft, ctx) => {
  if (draft.kind !== 'marker') return { ok: true };
  const r = MarkerNameSchema.safeParse(draft.name);
  if (!r.success) {
    return { ok: false, message: r.error.issues[0].message };
  }
  // scope = siblings (caller filters out self for edit case)
  if (hasNamedStepConflict(ctx.siblings, draft.name)) {
    return { ok: false, message: VALIDATION_MSG.duplicateNamedStep };
  }
  return { ok: true };
};

/** A configured bank target needs ≥1 rule. */
const validateInteract: StepValidator = (draft) => {
  if (draft.kind !== 'interact') return { ok: true };
  if (draft.target.bank && draft.target.bank.rules.length === 0) {
    return { ok: false, message: VALIDATION_MSG.bankRulesRequired };
  }
  return { ok: true };
};

/** No-op: the NPC name is enforced by the schema; nothing else to gate at creation time. */
const validateFollow: StepValidator = () => ({ ok: true });

/**
 * Portal pad must match the zone catalog (center tile or any tile inside the pad).
 * Distance gates mirror walk so long hops still warn via TELEPORT_THRESHOLD.
 */
const validatePortal: StepValidator = (draft, ctx) => {
  if (draft.kind !== 'portal') return { ok: true };

  const pad =
    findPortalByCenter(draft.position.x, draft.position.y) ??
    findPortalAt(draft.position.x, draft.position.y);
  if (!pad) {
    return { ok: false, message: VALIDATION_MSG.portalUnknownPad };
  }

  const from = getLastAnchor(ctx.steps, ctx.playerPos);
  const dist = chebyshev(from, draft.position);

  if (dist > TELEPORT_THRESHOLD) {
    return { ok: true, warning: VALIDATION_MSG.walkTeleportSuspected(dist) };
  }

  if (!isInBounds(from) || !isInBounds(draft.position)) {
    return { ok: false, message: VALIDATION_MSG.positionOutOfBounds };
  }

  if (dist > MAX_STEP_DISTANCE) {
    return { ok: false, message: VALIDATION_MSG.walkTooFar };
  }

  const svc = getWalkabilityService();
  if (!svc.canStep(from.x, from.y, draft.position.x, draft.position.y)) {
    return { ok: false, message: VALIDATION_MSG.walkBlocked };
  }

  return { ok: true };
};

const STEP_VALIDATORS: Record<MacroStepKind, StepValidator> = {
  walk: validateWalk,
  interact: validateInteract,
  follow: validateFollow,
  delay: validateDelay,
  script: validateScript,
  marker: validateMarker,
  portal: validatePortal,
};

export const validateStepDraft = (draft: StepDraft, ctx: ValidationContext): ValidationResult =>
  STEP_VALIDATORS[draft.kind](draft, ctx);
