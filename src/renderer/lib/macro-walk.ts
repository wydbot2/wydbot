import type { ActionHandler } from './macro-engine-types';
import { emitMacroEvent } from './macro-events';
import { awaitMove } from './macro-move-request';
import { pickWalkableTileAround } from './walkability-pickers';

/** Random offset radius applied by `approx`-mode walks. */
export const APPROX_JITTER_RADIUS = 2;

/**
 * Walk handler — frames a single `awaitMove` call with lifecycle events.
 *
 * - `exact`: precise coordinate targeting
 * - `approx`: random walkable tile within `APPROX_JITTER_RADIUS` of step.position; falls
 *   back to exact if none exist (step.position is validated at creation).
 *
 * Terminal event invariant: every `walkStarted` is paired with exactly one
 * terminal event (`walkResolved` on success, `walkAborted` on cancellation
 * or rejection).
 */
export const executeWalk: ActionHandler = async (step, ctx) => {
  if (step.kind !== 'walk') return { delayMs: 0 };
  const { mode } = step;
  let dest = { x: step.position.x, y: step.position.y };

  if (mode === 'approx') {
    const jittered = pickWalkableTileAround(step.position, APPROX_JITTER_RADIUS);
    if (jittered) dest = jittered;
  }

  emitMacroEvent({ kind: 'walkStarted', dest });
  try {
    await awaitMove(dest, ctx.signal);
  } catch (err) {
    emitMacroEvent({ kind: 'walkAborted' });
    throw err;
  }
  emitMacroEvent({ kind: 'walkResolved', dest });
  return { delayMs: 0 };
};
