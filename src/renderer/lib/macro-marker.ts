import type { ActionHandler } from './macro-engine-types';

/**
 * Marker — declarative named point in the sequence. Pass-through: no I/O,
 * no delay, no game side-effect. The `name` is unique across the macro
 * (enforced by `validateMarker` + schema `superRefine`) and will be the
 * addressable target of a future `ctx.macro.goMarker(name)` API.
 */
export const executeMarker: ActionHandler = async (step) => {
  if (step.kind !== 'marker') return { delayMs: 0 };
  return { delayMs: 0 };
};
