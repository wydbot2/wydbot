import type { ActionHandler } from './macro-engine-types';
import { abortableDelay } from './macro-timing';

export const executeDelay: ActionHandler = async (step, ctx) => {
  if (step.kind !== 'delay') return { delayMs: 0 };
  await abortableDelay(step.ms, ctx.signal);
  return { delayMs: 0 };
};
