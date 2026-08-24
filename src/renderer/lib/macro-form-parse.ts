import { InteractTargetSchema, DelayStepSchema } from '@shared/app-config';
import type { MPosition } from '@shared/types';

/**
 * Pre-parse helpers — absorb raw form strings before they reach the schema,
 * so stringy/NaN inputs never surface Zod's default English errors. Bound
 * checks (range, length) delegate to the canonical schemas; a single edit
 * there propagates without touching these helpers.
 */

/**
 * Returns null on NaN. Bounds (0–4095) are NOT checked here — `validateWalk`
 * (backed by `walkability-service`) reports `out_of_bounds` downstream with a
 * more specific message.
 */
export const parsePosition = (xRaw: string, yRaw: string): MPosition | null => {
  const x = parseInt(xRaw, 10);
  const y = parseInt(yRaw, 10);
  if (isNaN(x) || isNaN(y)) return null;
  return { x, y };
};

export const parseNpcName = (raw: string): string | null => {
  const trimmed = raw.trim();
  return InteractTargetSchema.shape.npcName.safeParse(trimmed).success ? trimmed : null;
};

export const parseDelaySeconds = (raw: string): number | null => {
  const seconds = parseFloat(raw.replace(',', '.'));
  if (isNaN(seconds)) return null;
  const ms = Math.round(seconds * 1000);
  return DelayStepSchema.shape.ms.safeParse(ms).success ? ms : null;
};
