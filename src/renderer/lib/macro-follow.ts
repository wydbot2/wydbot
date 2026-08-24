import type { ActionHandler } from './macro-engine-types';
import { approachNpc } from './macro-npc-approach';
import { logMacro } from './macro-log';

/**
 * Follow — walk within range of the named NPC and stop, without interacting.
 * Reuses the click-free `approachNpc` shared with `executeInteract`. One-shot:
 * on arrival the step advances. Non-blocking on failure (a follow has no
 * transactional side-effect, unlike bank/compose) — it logs and advances.
 */
export const executeFollow: ActionHandler = async (step, ctx) => {
  if (step.kind !== 'follow') return { delayMs: 0 };
  const { npcName } = step.target;

  const outcome = await approachNpc(npcName, ctx.signal);
  switch (outcome.status) {
    case 'arrived':
    case 'aborted':
      return { delayMs: 0 };
    case 'not-fresh':
      logMacro('warn', `[seguir] NPC "${npcName}" não encontrado — pulando`);
      return { delayMs: 0 };
    case 'gone':
    case 'stuck':
      logMacro('warn', `[seguir] não foi possível chegar até "${npcName}" — pulando`);
      return { delayMs: 0 };
  }
  outcome satisfies never;
  return { delayMs: 0 };
};
