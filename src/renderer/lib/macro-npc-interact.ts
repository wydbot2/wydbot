import { chebyshev } from '@shared/lib/movement-math';
import type { BankRule, ComposeAction, ShopOpen, ShopRule } from '@shared/app-config';
import type { ViewItem } from '@shared/types/item-types';
import type { IpcShopItem } from '@shared/ipc/ipc-api';
import { encodeShopWireSlot } from '@shared/lib/shop-slot';
import { gameApi } from './game-api';
import type { ActionHandler } from './macro-engine-types';
import { abortableDelay } from './macro-timing';
import { pauseMacro } from './macro-engine';
import { awaitMove } from './macro-move-request';
import { MoveRejectedError } from './move-echo-bus';
import { onNpcInteractOutOfRange } from './npc-interact-bus';
import { getEntityLivePosition } from './entity-position';
import { pickReachableTileAround } from './walkability-pickers';
import {
  waitForFreshNpc,
  resolveClosestNpc,
  NPC_INTERACT_RANGE,
  MAX_LOOP_ITERATIONS,
  APPROACH_RADIUS_DEFAULT,
} from './macro-npc-approach';
import { getItem } from './item-db';
import { stackCapOf } from './item-stack-utils';
import { logMacro } from './macro-log';
import { planBankRule } from './bank-rules';
import { gatherComposeIngredients } from './compose-rules';
import { resolveShopBuy, findFreeBagSlot } from './shop-rules';
import { resolveInteractService } from './interact-service';
import { usePlayerStore } from '../stores/player-store';
import { useShopStore } from '../stores/shop-store';

const MAX_OUT_OF_RANGE_RETRIES = 3;
const CLICK_SETTLE_MS = 800;
const RETRY_BACKOFF_MS: readonly number[] = [500, 1000];
const APPROACH_RADIUS_LAST_RETRY = 1;

const BANK_BAG = 1; // container kind: 0=equip, 1=bag, 2=storage
const BANK_STORAGE = 2;
const BANK_OP_GAP_MS = 1000; // matches the itemMove/gold action-queue cooldown
const DEPOSIT_VERIFY_TIMEOUT_MS = 2000;
const DEPOSIT_POLL_MS = 200;

/** Poll until the source slot's count drops (server moved the item via 0x182), or timeout. */
const waitForSlotDrain = async (
  read: () => ViewItem | undefined,
  itemId: number,
  beforeCount: number,
  signal: AbortSignal,
): Promise<boolean> => {
  const deadline = Date.now() + DEPOSIT_VERIFY_TIMEOUT_MS;
  while (!signal.aborted) {
    const it = read();
    const nowCount = it && it.index === itemId ? (it.stackCount ?? 1) : 0;
    if (nowCount < beforeCount) return true;
    if (Date.now() >= deadline) return false;
    await abortableDelay(DEPOSIT_POLL_MS, signal);
  }
  return false;
};

/**
 * Open-loop bank rule runner (no client storage state in v1). Deposit items move
 * BAG→STORAGE with dstSlot 0 — the server auto-places. Gold uses 0x388/0x387.
 * Item withdraw is deferred. Honors the AbortSignal between every rule.
 */
const runBankRules = async (
  rules: BankRule[],
  bankerId: number,
  signal: AbortSignal,
  fullStackOnly = false,
): Promise<void> => {
  for (const rule of rules) {
    if (signal.aborted) return;
    // Item rules repeat until no source slot matches, so every matching stack moves (not just the first).
    let moved = 0;
    while (!signal.aborted) {
      const { inventory, storage } = usePlayerStore.getState();
      const op = planBankRule(rule, inventory, storage, stackCapOf, fullStackOnly);

      if (op.kind === 'gold') {
        if (op.direction === 'deposit') gameApi.bankDepositGold(op.amount);
        else gameApi.bankWithdrawGold(op.amount);
        logMacro(
          'info',
          `[banco] ${op.direction === 'deposit' ? 'depositar' : 'sacar'} ${op.amount} de ouro`,
        );
        await abortableDelay(BANK_OP_GAP_MS, signal);
        break;
      }

      if (op.kind === 'deposit-item' || op.kind === 'withdraw-item') {
        const depositing = op.kind === 'deposit-item';
        const name = getItem(op.itemId)?.name ?? `Item #${op.itemId}`;
        const srcArray = depositing ? inventory : storage;
        const beforeCount = srcArray[op.srcSlot]?.stackCount ?? 1;
        const [srcKind, dstKind] = depositing ? [BANK_BAG, BANK_STORAGE] : [BANK_STORAGE, BANK_BAG];

        gameApi.itemMove(srcKind, op.srcSlot, dstKind, op.dstSlot, bankerId);
        const settled = await waitForSlotDrain(
          () =>
            depositing
              ? usePlayerStore.getState().inventory[op.srcSlot]
              : usePlayerStore.getState().storage[op.srcSlot],
          op.itemId,
          beforeCount,
          signal,
        );
        logMacro(
          settled ? 'info' : 'warn',
          `[banco] ${depositing ? 'depositar' : 'sacar'} ${name} (slot ${op.srcSlot})${settled ? ' — ok' : ' — sem confirmação'}`,
        );
        await abortableDelay(BANK_OP_GAP_MS, signal);
        // Unconfirmed move: state is unchanged, so re-planning would loop forever.
        if (!settled) break;
        moved += 1;
        continue;
      }

      const skipName =
        op.rule.itemId !== undefined
          ? (getItem(op.rule.itemId)?.name ?? `Item #${op.rule.itemId}`)
          : '';
      if (op.reason === 'bank-full') {
        pauseMacro(`Banco cheio — sem espaço para depositar ${skipName}.`);
        return;
      }
      if (op.reason === 'bag-full') {
        pauseMacro(`Mochila cheia — sem espaço para sacar ${skipName}.`);
        return;
      }
      if (op.reason === 'no-full-stack') break; // partial stacks stay in the bag — silent by design
      if (op.reason === 'item-absent' && moved === 0) {
        const where = op.rule.direction === 'withdraw' ? 'guarda' : 'mochila';
        logMacro('info', `[banco] ${skipName} ausente na ${where} — pulando`);
      }
      break;
    }
  }
};

/** Submit each action's recipe (0x2e7) with bag-gathered ingredients; open-loop (no confirmation), skips a missing ingredient. */
const runComposeActions = async (actions: ComposeAction[], signal: AbortSignal): Promise<void> => {
  for (const action of actions) {
    if (signal.aborted) return;
    const { gathered, missingId } = gatherComposeIngredients(
      action,
      usePlayerStore.getState().inventory,
    );
    if (missingId !== null) {
      const name = getItem(missingId)?.name ?? `Item #${missingId}`;
      logMacro('info', `[compor] ${action.label} — falta ${name} na mochila, pulando`);
      continue;
    }
    gameApi.composeSubmit({ recipeIndex: action.recipeIndex, ingredients: gathered });
    logMacro('info', `[compor] ${action.label}`);
    await abortableDelay(BANK_OP_GAP_MS, signal);
  }
};

const SHOP_INVENTORY_TIMEOUT_MS = 3000;
const SHOP_INVENTORY_POLL_MS = 200;
const SHOP_OP_GAP_MS = 1000;
const BUY_VERIFY_TIMEOUT_MS = 2000;
const BUY_VERIFY_POLL_MS = 200;

const sendShopOpen = (npcIndex: number, open: ShopOpen): void => {
  if (open === 'npc') gameApi.npcClick(npcIndex);
  else gameApi.dialogClick(npcIndex);
};

type ShopOpenResult =
  | { kind: 'items'; items: IpcShopItem[] }
  | { kind: 'rejected' }
  | { kind: 'timeout' }
  | { kind: 'aborted' };

/**
 * Exactly one open C2S (from config SoT) + wait for 0x17C or out-of-range.
 * No dual-attempt — that belongs only to the probe.
 */
const openShopOnce = (
  npcIndex: number,
  open: ShopOpen,
  signal: AbortSignal,
): Promise<ShopOpenResult> => {
  const sinceEpoch = useShopStore.getState().epoch;
  const deadline = Date.now() + SHOP_INVENTORY_TIMEOUT_MS;

  return new Promise((resolve) => {
    let done = false;
    const finish = (result: ShopOpenResult): void => {
      if (done) return;
      done = true;
      unsubRejection();
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const unsubRejection = onNpcInteractOutOfRange(() => finish({ kind: 'rejected' }));
    const onAbort = (): void => finish({ kind: 'aborted' });
    signal.addEventListener('abort', onAbort, { once: true });

    logMacro('info', `[loja] open via ${open === 'npc' ? '0x28b' : '0x27b'}`);
    sendShopOpen(npcIndex, open);

    const poll = async (): Promise<void> => {
      try {
        while (!done) {
          if (signal.aborted) {
            finish({ kind: 'aborted' });
            return;
          }
          const { epoch, items } = useShopStore.getState();
          if (epoch > sinceEpoch && items.length > 0) {
            finish({ kind: 'items', items: [...items] });
            return;
          }
          if (Date.now() >= deadline) {
            finish({ kind: 'timeout' });
            return;
          }
          await abortableDelay(SHOP_INVENTORY_POLL_MS, signal);
        }
      } catch {
        // abortableDelay rejects on abort — do not unhandled-reject
        finish({ kind: 'aborted' });
      }
    };
    void poll();
  });
};

/**
 * Poll until bag `bagSlot` holds `itemId`, or total stack count of `itemId`
 * increases (0x182 confirmation), or timeout.
 */
const waitForItemArrival = async (
  itemId: number,
  bagSlot: number,
  beforeTotal: number,
  signal: AbortSignal,
): Promise<boolean> => {
  const deadline = Date.now() + BUY_VERIFY_TIMEOUT_MS;
  while (!signal.aborted) {
    const inv = usePlayerStore.getState().inventory;
    if (inv[bagSlot]?.index === itemId) return true;
    const total = inv.reduce(
      (sum, it) => sum + (it.index === itemId ? (it.stackCount ?? 1) : 0),
      0,
    );
    if (total > beforeTotal) return true;
    if (Date.now() >= deadline) return false;
    await abortableDelay(BUY_VERIFY_POLL_MS, signal);
  }
  return false;
};

/**
 * Shop rule runner — shop panel slot from 0x17C; bag slot from free-slot scan
 */
const runShopRules = async (
  rules: ShopRule[],
  npcIndex: number,
  signal: AbortSignal,
  shopItems: readonly IpcShopItem[],
): Promise<void> => {
  for (const rule of rules) {
    if (signal.aborted) return;
    const name = getItem(rule.itemId)?.name ?? `Item #${rule.itemId}`;
    const buy = resolveShopBuy(rule, shopItems);
    if (buy.kind === 'skip') {
      // Hard fail — same posture as bank-full: pause so the user can fix config/stock.
      pauseMacro(`Loja — ${name} não está disponível no vendedor.`);
      return;
    }
    for (let qty = 0; qty < rule.quantity; qty++) {
      if (signal.aborted) return;
      const inventory = usePlayerStore.getState().inventory;
      const bagSlot = findFreeBagSlot(inventory);
      if (bagSlot < 0) {
        pauseMacro(`Mochila cheia — sem espaço para comprar ${name}.`);
        return;
      }
      const beforeTotal = inventory.reduce(
        (sum, it) => sum + (it.index === rule.itemId ? (it.stackCount ?? 1) : 0),
        0,
      );
      gameApi.shopBuy({ npcIndex, slotIndex: buy.slotIndex, bagSlot });
      const wireSlot = encodeShopWireSlot(buy.slotIndex);
      logMacro(
        'info',
        `[loja] 0x379 npc=${npcIndex} linearSlot=${buy.slotIndex} wireSlot=${wireSlot} bagSlot=${bagSlot}`,
      );
      const settled = await waitForItemArrival(rule.itemId, bagSlot, beforeTotal, signal);
      if (!settled) {
        pauseMacro(
          `Loja — compra de ${name} não confirmada (${qty + 1}/${rule.quantity}). Verifique ouro, estoque e slot.`,
        );
        return;
      }
      logMacro('info', `[loja] comprou ${name} (${qty + 1}/${rule.quantity}) — ok`);
      await abortableDelay(SHOP_OP_GAP_MS, signal);
    }
  }
};

/** Approach the NPC, then send the category-appropriate click. */
export const executeInteract: ActionHandler = async (step, ctx) => {
  if (step.kind !== 'interact') return { delayMs: 0 };
  const { target } = step;
  const { npcName } = target;

  const npcReady = await waitForFreshNpc(npcName, ctx.signal);
  if (ctx.signal.aborted) return { delayMs: 0 };
  if (!npcReady) {
    pauseMacro(`NPC "${npcName}" não confirmado após teleporte — verifique a posição.`);
    return { delayMs: 0 };
  }

  let outOfRangeRetries = 0;

  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    if (ctx.signal.aborted) return { delayMs: 0 };

    const myPos = usePlayerStore.getState().position;
    const liveNpc = resolveClosestNpc(npcName, myPos);
    if (!liveNpc) return { delayMs: 0 };

    const npcPos = getEntityLivePosition(liveNpc);
    if (chebyshev(myPos, npcPos) <= NPC_INTERACT_RANGE) {
      const service = resolveInteractService(target);

      if (service.kind === 'shop') {
        const open = await openShopOnce(liveNpc.index, service.open, ctx.signal);
        if (ctx.signal.aborted || open.kind === 'aborted') return { delayMs: 0 };
        if (open.kind === 'items') {
          await runShopRules(service.rules, liveNpc.index, ctx.signal, open.items);
          return { delayMs: 0 };
        }
        if (open.kind === 'timeout') {
          pauseMacro(`Loja de "${npcName}" não abriu — verifique se o NPC é vendedor e a posição.`);
          return { delayMs: 0 };
        }
        // rejected → fall through to out-of-range retry
      } else if (service.kind === 'bank') {
        const rejected = await dispatchClickAndWaitForSettle(liveNpc.index, ctx.signal);
        if (!rejected) {
          await runBankRules(
            service.rules,
            liveNpc.index,
            ctx.signal,
            service.depositFullStackOnly,
          );
          return { delayMs: 0 };
        }
      } else if (service.kind === 'compose') {
        const rejected = await dispatchClickAndWaitForSettle(liveNpc.index, ctx.signal);
        if (!rejected) {
          await runComposeActions(service.actions, ctx.signal);
          return { delayMs: 0 };
        }
      } else {
        const rejected = await dispatchClickAndWaitForSettle(liveNpc.index, ctx.signal);
        if (!rejected) return { delayMs: 0 };
      }

      outOfRangeRetries += 1;
      if (outOfRangeRetries >= MAX_OUT_OF_RANGE_RETRIES) {
        pauseMacro(
          `NPC "${npcName}" rejeitou ${MAX_OUT_OF_RANGE_RETRIES} cliques (distância). Possível desync — verifique posição.`,
        );
        return { delayMs: 0 };
      }

      await abortableDelay(RETRY_BACKOFF_MS[outOfRangeRetries - 1], ctx.signal);

      if (outOfRangeRetries === MAX_OUT_OF_RANGE_RETRIES - 1) {
        const fallback = pickReachableTileAround(
          npcPos,
          APPROACH_RADIUS_LAST_RETRY,
          usePlayerStore.getState().position,
        );
        if (fallback) await awaitMove(fallback, ctx.signal);
      }
      continue;
    }

    const approach = pickReachableTileAround(
      npcPos,
      APPROACH_RADIUS_DEFAULT,
      usePlayerStore.getState().position,
    );
    if (!approach) return { delayMs: 0 };

    try {
      await awaitMove(approach, ctx.signal);
    } catch (err) {
      // No route to this tile — try a different ring tile.
      if (err instanceof MoveRejectedError && err.payload.reason === 'unreachable') continue;
      throw err;
    }
  }

  return { delayMs: 0 };
};

/** Non-shop interact click (0x28b) + settle / out-of-range. */
const dispatchClickAndWaitForSettle = (npcIndex: number, signal: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    let done = false;
    const finish = (rejected: boolean): void => {
      if (done) return;
      done = true;
      unsubRejection();
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
      resolve(rejected);
    };

    const unsubRejection = onNpcInteractOutOfRange(() => finish(true));
    const timeoutId = setTimeout(() => finish(false), CLICK_SETTLE_MS);
    const onAbort = (): void => finish(false);
    signal.addEventListener('abort', onAbort, { once: true });

    gameApi.npcClick(npcIndex);
  });
