import type { ActionHandler } from './macro-engine-types';
import { pauseMacro } from './macro-engine';
import { logMacro } from './macro-log';
import { runScript, translateScriptError } from './script-runtime';
import { buildCtxHandle } from './script-ctx';
import { requestMacroAlert } from './macro-alert-gate';
import { attackScriptControl } from './macro-script-control';
import { gameApi } from './game-api';
import { ScrollRejectedError } from './scroll-echo-bus';
import { useAppConfigStore } from '../stores/app-config-store';

/** Pure-JS budget. Asyncify suspends WASM stack on host `await`, so it doesn't count. */
const SCRIPT_BUDGET_MS = 5000;

/** Bag width — global slot = `bag * 15 + slotInBag` (matches the script Item projection). */
const INVENTORY_BAG_SIZE = 15;

interface TeleportScrollIntent {
  slot: number;
  bag: number;
  itemId: number;
  x: number;
  y: number;
}

interface ReturnScrollIntent {
  slot: number;
  bag: number;
  itemId: number;
}

/** Direct-use consumable: deferred `gameApi.useItem` (0x373 Form A, no channel). */
interface UseItemIntent {
  slot: number;
  bag: number;
  itemId: number;
}

/** Inventory item discard: deferred `gameApi.itemDestroy` (0x02E4 trash-bin). */
interface DeleteItemIntent {
  slot: number;
  bag: number;
  itemId: number;
}

export const executeScript: ActionHandler = async (step, { signal }) => {
  if (step.kind !== 'script') return { delayMs: 0 };

  // Captured here, applied via StepResult.jumpTo so the engine bypasses the
  // default +1 advance. Last call wins if the script invokes goToMarker more
  // than once (matches ctx.macro.pause's "última chamada vence" semantics).
  let goToMarkerName: string | undefined;
  // Deferred intent, applied after the script run (last call wins).
  let teleportIntent: TeleportScrollIntent | undefined;
  let returnIntent: ReturnScrollIntent | undefined;
  let useItemIntent: UseItemIntent | undefined;
  let deleteItemIntent: DeleteItemIntent | undefined;

  try {
    await runScript(
      step.source,
      (qctx, budget) =>
        buildCtxHandle(qctx, {
          onPauseRequest: (reason) => {
            pauseMacro(reason ? `Script pediu pausa: ${reason}` : 'Script pediu pausa');
          },
          onGoToMarkerRequest: (name) => {
            goToMarkerName = name;
          },
          onAttackPauseRequest: () => attackScriptControl.pause(),
          onAttackStartRequest: () => attackScriptControl.start(),
          attackStatus: () => attackScriptControl.status(),
          onUseTeleportScrollRequest: (item, x, y) => {
            teleportIntent = { slot: item.slot, bag: item.bag, itemId: item.itemId, x, y };
          },
          onUseReturnScrollRequest: (item) => {
            returnIntent = { slot: item.slot, bag: item.bag, itemId: item.itemId };
          },
          onUseItemRequest: (item) => {
            useItemIntent = { slot: item.slot, bag: item.bag, itemId: item.itemId };
          },
          onDeleteItemRequest: (item) => {
            deleteItemIntent = { slot: item.slot, bag: item.bag, itemId: item.itemId };
          },
          onAlertRequest: (message) => {
            budget.pause();
            return requestMacroAlert(message, signal).finally(() => budget.resume());
          },
        }),
      { signal, timeoutMs: SCRIPT_BUDGET_MS },
    );
  } catch (err) {
    if (signal.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    const msg = translateScriptError(err);
    logMacro('error', `[script] ${msg}`);
    throw new Error(msg);
  }

  // Delete (trash-bin) before use — avoids consuming a slot the script asked to discard.
  // Last-call-wins (single intent), matching useItemIntent.
  if (deleteItemIntent) {
    const globalSlot = deleteItemIntent.bag * INVENTORY_BAG_SIZE + deleteItemIntent.slot;
    gameApi.itemDestroy(globalSlot, deleteItemIntent.itemId);
  }

  // Direct use before scroll channels — no 5s wait, no position re-base.
  // Prefer not mixing direct use + scroll use in the same script step.
  if (useItemIntent) {
    const globalSlot = useItemIntent.bag * INVENTORY_BAG_SIZE + useItemIntent.slot;
    const ok = gameApi.useItem(globalSlot, useItemIntent.itemId, 0);
    if (!ok) {
      logMacro('error', `[script] item não usado: ausente no slot (id=${useItemIntent.itemId})`);
    }
  }

  // Teleport before any marker jump — the scroll consumes ~5s and re-bases position.
  if (teleportIntent) {
    const globalSlot = teleportIntent.bag * INVENTORY_BAG_SIZE + teleportIntent.slot;
    try {
      await gameApi.useTeleportScroll(
        globalSlot,
        teleportIntent.itemId,
        teleportIntent.x,
        teleportIntent.y,
        signal,
      );
    } catch (err) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      const reason = err instanceof ScrollRejectedError ? err.reason : String(err);
      logMacro('error', `[script] pergaminho não usado: ${reason}`);
    }
  }

  // Return scroll: same deferred timing (consumes ~5s, server re-bases position).
  if (returnIntent) {
    const globalSlot = returnIntent.bag * INVENTORY_BAG_SIZE + returnIntent.slot;
    try {
      await gameApi.useReturnScroll(globalSlot, returnIntent.itemId, signal);
    } catch (err) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      const reason = err instanceof ScrollRejectedError ? err.reason : String(err);
      logMacro('error', `[script] pergaminho de retorno não usado: ${reason}`);
    }
  }

  if (goToMarkerName === undefined) return { delayMs: 0 };

  const steps = useAppConfigStore.getState().config.steps ?? [];
  const idx = steps.findIndex((s) => s.kind === 'marker' && s.name === goToMarkerName);
  if (idx === -1) {
    logMacro('error', `[script] goToMarker: marcador '${goToMarkerName}' não encontrado`);
    return { delayMs: 0 };
  }
  return { delayMs: 0, jumpTo: idx };
};
