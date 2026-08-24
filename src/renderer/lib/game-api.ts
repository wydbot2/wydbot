import type { ServerChannel } from '@shared/constants/server-channels';
import type { ComposeSubmitPayload, MoveChunkStatus } from '@shared/ipc/ipc-api';
import type { StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';
import type { ViewItem } from '@shared/types/item-types';
import { usePlayerStore } from '../stores/player-store';
import { getWydAPI } from './electron-api';
import { logMacro } from './macro-log';
import { onMoveEcho, onMoveEnqueued, onMoveRejected, MoveRejectedError } from './move-echo-bus';
import { onTeleportScrollDone, ScrollRejectedError } from './scroll-echo-bus';

/** Floor for the echo deadline — covers local round-trips where no queue wait exists. */
const MOVE_ECHO_MIN_TIMEOUT_MS = 5000;
/** Safety margin added on top of the main's expected total, covering IPC jitter. */
const MOVE_ECHO_MARGIN_MS = 1500;

/** Echo deadline for a scroll — must exceed the ~5s channel + IPC jitter. */
const SCROLL_ECHO_TIMEOUT_MS = 8000;

const ZONE_PORTAL_TIMEOUT_MS = 5000;

// Per-move id so each promise resolves only on its own echo (echo-bus cross-talk fix).
let moveSeq = 0;
// Per-scroll id so each promise resolves only on its own DONE echo.
let scrollSeq = 0;

/**
 * Slots cleared optimistically by `itemDestroy`, restored if main reports the
 * emit died in the ActionQueue (ITEM_DESTROY_FAILED). TTL covers the queue
 * stale window (10s) plus margin.
 */
const DESTROY_STASH_TTL_MS = 15_000;
const pendingDestroys = new Map<number, { item: ViewItem; ts: number }>();
let destroyFailureListenerArmed = false;

/** Idempotent — subscribes to ITEM_DESTROY_FAILED and restores the stashed item. */
const armDestroyFailureListener = (): void => {
  if (destroyFailureListenerArmed) return;
  const api = getWydAPI();
  if (!api) return;
  destroyFailureListenerArmed = true;
  api.onItemDestroyFailed(({ slot, itemId }) => {
    const stashed = pendingDestroys.get(slot);
    pendingDestroys.delete(slot);
    if (!stashed || stashed.item.index !== itemId) return;
    if (Date.now() - stashed.ts > DESTROY_STASH_TTL_MS) return;
    const current = usePlayerStore.getState().inventory[slot];
    // Slot re-occupied since (new loot) — never overwrite live content.
    if (current && current.index !== 0) return;
    logMacro(
      'warn',
      `[item] destroy expirou na fila (stale-drop) — item restaurado: slot ${slot} id=${itemId}`,
    );
    usePlayerStore.getState().updateInventorySlot(slot, stashed.item);
  });
};

/** Drop stash entries older than the TTL — successful destroys never get an event. */
const sweepDestroyStash = (now: number): void => {
  for (const [slot, entry] of pendingDestroys) {
    if (now - entry.ts > DESTROY_STASH_TTL_MS) pendingDestroys.delete(slot);
  }
};

export const gameApi = {
  connect: (channel: ServerChannel, proxyListUrl: string | null = null) =>
    getWydAPI()?.connect({
      server: channel,
      proxy: proxyListUrl ? { enabled: true, listUrl: proxyListUrl } : { enabled: false },
    }),

  disconnect: () => getWydAPI()?.disconnect(),

  login: (username: string, password: string, hardwareIdentitySeed: string | null = null) =>
    getWydAPI()?.login({ username, password, hardwareIdentitySeed }),

  submitToken: (token: string) => getWydAPI()?.submitToken({ password: token, isChanging: 0 }),

  selectCharacter: (index: number) => getWydAPI()?.selectChar({ charIndex: index }),

  /** Push the full planned route for a source; main re-slices it per chunk. */
  setMoveRoute: (source: string, route: StreamRoute): void =>
    getWydAPI()?.setMoveRoute({
      source,
      tiles: route.tiles,
      codes: route.codes,
      waypoints: route.waypoints,
    }),

  /**
   * Resolves with the chunk outcome on the MOVE_ANNOUNCED echo (backpressure: the next step
   * waits for the walk to commit). `source` set → route-driven (main slices from its predicted);
   * omitted → straight-line (manual click). Timeout armed from MOVE_ENQUEUED's expected total.
   */
  move: (
    to: MPosition,
    speedMove: number,
    signal?: AbortSignal,
    source?: string,
    opts?: { exact?: boolean },
  ): Promise<MoveChunkStatus> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const moveId = ++moveSeq;
      let done = false;
      let timeoutId: ReturnType<typeof setTimeout>;
      let timeoutMs = MOVE_ECHO_MIN_TIMEOUT_MS;

      const cleanup = (): void => {
        done = true;
        unsubscribeEcho();
        unsubscribeEnqueued();
        unsubscribeRejected();
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onAbort);
      };

      const rejectTimeout = (): void => {
        if (!done) {
          cleanup();
          reject(new MoveRejectedError({ reason: 'timeout' }));
        }
      };

      const unsubscribeEcho = onMoveEcho((echo) => {
        if (echo.moveId !== moveId || done) return;
        cleanup();
        resolve(echo.status);
      });
      const unsubscribeEnqueued = onMoveEnqueued((enq) => {
        if (enq.moveId !== moveId || done) return;
        clearTimeout(timeoutId);
        timeoutMs = Math.max(MOVE_ECHO_MIN_TIMEOUT_MS, enq.expectedTotalMs + MOVE_ECHO_MARGIN_MS);
        timeoutId = setTimeout(rejectTimeout, timeoutMs);
      });
      const unsubscribeRejected = onMoveRejected((payload) => {
        if (payload.moveId !== moveId || done) return;
        cleanup();
        reject(new MoveRejectedError(payload));
      });

      timeoutId = setTimeout(rejectTimeout, timeoutMs);

      const onAbort = (): void => {
        if (!done) {
          cleanup();
          reject(signal?.reason ?? new Error('aborted'));
        }
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      getWydAPI()?.move({
        moveId,
        destiny: to,
        moveType: 0,
        speedMove,
        source,
        exact: opts?.exact === true ? true : undefined,
      });
    }),

  /**
   * Basic attack (`skillId === 0`) or skill cast. Multi-target skills pass
   * `packetKind` (SkillData) and optional `extraTargetIndexes` (secondary slots).
   */
  attack: (
    targetIndex: number,
    targetPosition: MPosition,
    skillId: number,
    opts?: { packetKind?: number; extraTargetIndexes?: readonly number[] },
  ) =>
    getWydAPI()?.attack({
      targetIndex,
      targetPosition,
      skillId,
      packetKind: opts?.packetKind,
      extraTargetIndexes: opts?.extraTargetIndexes ? [...opts.extraTargetIndexes] : undefined,
    }),

  /** Self/no-target buff cast. `packetKind` (0=generic/0x367, 1=self/0x39D). */
  castBuff: (skillId: number, packetKind: 0 | 1) => getWydAPI()?.castBuff({ skillId, packetKind }),

  npcClick: (targetMobIndex: number) => getWydAPI()?.npcClick({ targetMobIndex }),

  /** Dialog/quest/trainer click (0x27b, nibble 1). Some dialog NPCs reply with shop 0x17C. */
  dialogClick: (targetMobIndex: number) => getWydAPI()?.dialogClick({ targetMobIndex }),

  respawn: () => getWydAPI()?.respawn(),

  miniPopupClick: (buttonIndex: number) => getWydAPI()?.miniPopupClick({ buttonIndex }),

  /** Zone portal (0x290) — resolves on the next S2C teleport with moveType 1. */
  useZonePortal: (signal?: AbortSignal): Promise<MPosition> =>
    new Promise((resolve, reject) => {
      let done = false;
      const cleanup = (): void => {
        done = true;
        clearTimeout(timer);
        unsub?.();
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = (): void => {
        if (!done) {
          cleanup();
          reject(signal?.reason ?? new Error('aborted'));
        }
      };
      const timer = setTimeout(() => {
        if (!done) {
          cleanup();
          reject(new Error('zone portal timeout'));
        }
      }, ZONE_PORTAL_TIMEOUT_MS);
      const unsub = getWydAPI()?.onTeleport((data) => {
        if (done || data.moveType !== 1) return;
        cleanup();
        resolve(data.pos);
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      getWydAPI()?.useZonePortal();
    }),

  /** Item move/stack (0x376). Same-item bag→bag onto an occupied stack ⇒ the
   * server consolidates. kind: 0=equip, 1=bag, 2=storage. `bankerId` is the
   * banker mobIndex (@+0x10) when moving to/from storage; omit for a bag drag. */
  itemMove: (
    srcKind: number,
    srcSlot: number,
    dstKind: number,
    dstSlot: number,
    bankerId?: number,
  ) => getWydAPI()?.itemMove({ srcKind, srcSlot, dstKind, dstSlot, bankerId }),

  /** Item-destroy (0x02E4). No server ack — clear the slot optimistically. */
  itemDestroy: (slot: number, itemId: number) => {
    armDestroyFailureListener();
    const now = Date.now();
    sweepDestroyStash(now);
    const item = usePlayerStore.getState().inventory[slot];
    if (item && item.index !== 0) pendingDestroys.set(slot, { item, ts: now });
    getWydAPI()?.itemDestroy({ slot, itemId });
    usePlayerStore.getState().clearInventorySlot(slot);
  },

  /**
   * 0x373 Form A use-item. **Requires the item to be present in the
   * inventory at the given slot** — pre-validates `inventory[slot].index === itemId`
   * and aborts (returning `false`) if not. Mirrors the canonical optimistic
   * local consume: stack `> 1` decrements by 1, else clears the slot.
   * Server reconciles via `0x182` (stack delta).
   *
   * @param slot         bag slot 0..59
   * @param itemId       expected item id at that slot (server-side cross-check)
   * @param feedMarker   `0` = potion/herb (cat 1/0xF2/0xF3); `0xE` = mount feed (cat 0xF)
   * @returns `true` if the IPC was emitted; `false` if the inventory check failed.
   */
  useItem: (slot: number, itemId: number, feedMarker: 0 | 0xe = 0): boolean => {
    const inventory = usePlayerStore.getState().inventory;
    const item = inventory[slot];
    if (!item || item.index === 0 || item.index !== itemId) {
      // Inventory pre-check failed — item not present at the expected slot.
      // Canonical behaviour: silent skip (no wire emit). Caller (ambient module)
      // is responsible for re-querying the inventory before the next tick.
      return false;
    }
    getWydAPI()?.useItem({ slot, itemId, feedMarker });
    // (`if (stackCount < 2) clearSlot else decrement`). Server reconciles via 0x182.
    if (item.stackCount !== undefined && item.stackCount > 1) {
      usePlayerStore
        .getState()
        .updateInventorySlot(slot, { ...item, stackCount: item.stackCount - 1 });
    } else {
      usePlayerStore.getState().clearInventorySlot(slot);
    }
    return true;
  },

  /**
   * Hunt-scroll teleport: arm (0x3AE) → ~5 s channel → use (0x373) with the
   * resolved destination index. Pre-validates the scroll is present at `slot`,
   * then awaits the main-side DONE echo. `destX`/`destY` are the desired tile;
   * main snaps them to the scroll's nearest `PotalPos` spot (≤3 tiles) and owns
   * the wire index. Resolves on success; rejects with `ScrollRejectedError`
   * (`bad-item` / `bad-dest` / `queue-stale` / `timeout`) or on abort.
   *
   * @param slot    global bag slot 0..59 (`bag*15 + slotInBag`)
   * @param itemId  expected scroll id at that slot (0xd68..0xd6d)
   * @param destX   desired destination tile X
   * @param destY   desired destination tile Y
   * @param signal  optional abort signal (macro cancellation)
   */
  useTeleportScroll: (
    slot: number,
    itemId: number,
    destX: number,
    destY: number,
    signal?: AbortSignal,
  ): Promise<void> => {
    const item = usePlayerStore.getState().inventory[slot];
    if (!item || item.index === 0 || item.index !== itemId) {
      return Promise.reject(new ScrollRejectedError('bad-item'));
    }
    if (signal?.aborted) return Promise.reject(new ScrollRejectedError('timeout'));

    const scrollId = ++scrollSeq;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = () => finish(() => reject(new ScrollRejectedError('timeout')));
      const unsubscribe = onTeleportScrollDone((echo) => {
        if (echo.scrollId !== scrollId) return;
        if (echo.outcome === 'ok') {
          finish(resolve);
        } else {
          const reason = echo.outcome; // narrowed: 'bad-item' | 'bad-dest' | 'queue-stale'
          finish(() => reject(new ScrollRejectedError(reason)));
        }
      });
      const timer = setTimeout(
        () => finish(() => reject(new ScrollRejectedError('timeout'))),
        SCROLL_ECHO_TIMEOUT_MS,
      );
      signal?.addEventListener('abort', onAbort);
      getWydAPI()?.useTeleportScroll({ scrollId, slot, itemId, destX, destY });
    });
  },

  /**
   * Channel scroll (Pergaminho Retorno / Teleporte / Portal): arm (0x3AE) → ~5 s
   * channel → use (0x373 with `+0x20=0`). No destination — the server picks the
   * fixed return/portal point. Pre-validates the scroll is present at `slot`,
   * then awaits the main-side DONE echo (reuses the teleport-scroll echo bus).
   * Resolves on success; rejects with `ScrollRejectedError` (`bad-item` /
   * `queue-stale` / `timeout`) or on abort.
   *
   * @param slot    global bag slot 0..59 (`bag*15 + slotInBag`)
   * @param itemId  expected channel-scroll id at that slot (410 / 411 / 699 / 776 / 3429 / 3430 / 3456)
   * @param signal  optional abort signal (macro cancellation)
   */
  useReturnScroll: (slot: number, itemId: number, signal?: AbortSignal): Promise<void> => {
    const item = usePlayerStore.getState().inventory[slot];
    if (!item || item.index === 0 || item.index !== itemId) {
      return Promise.reject(new ScrollRejectedError('bad-item'));
    }
    if (signal?.aborted) return Promise.reject(new ScrollRejectedError('timeout'));

    const scrollId = ++scrollSeq;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = () => finish(() => reject(new ScrollRejectedError('timeout')));
      const unsubscribe = onTeleportScrollDone((echo) => {
        if (echo.scrollId !== scrollId) return;
        if (echo.outcome === 'ok') {
          finish(resolve);
        } else {
          const reason = echo.outcome; // narrowed: 'bad-item' | 'bad-dest' | 'queue-stale'
          finish(() => reject(new ScrollRejectedError(reason)));
        }
      });
      const timer = setTimeout(
        () => finish(() => reject(new ScrollRejectedError('timeout'))),
        SCROLL_ECHO_TIMEOUT_MS,
      );
      signal?.addEventListener('abort', onAbort);
      getWydAPI()?.useReturnScroll({ scrollId, slot, itemId });
    });
  },

  /** Bank gold deposit (0x388). `amount` is the gold to move hand→bank. */
  bankDepositGold: (amount: number) => getWydAPI()?.bankDepositGold({ amount }),

  /** Bank gold withdraw (0x387). `amount` is the gold to move bank→hand. */
  bankWithdrawGold: (amount: number) => getWydAPI()?.bankWithdrawGold({ amount }),

  /** Composition submit (0x2e7). Caller gathers `ingredients` (item + stack + slot) from the live bag. */
  composeSubmit: (payload: ComposeSubmitPayload) => getWydAPI()?.composeSubmit(payload),

  /** Shop buy (0x379) — purchase one item from the merchant NPC. */
  shopBuy: (payload: { npcIndex: number; slotIndex: number; bagSlot: number }) =>
    getWydAPI()?.shopBuy(payload),

  /** Party invite (0x37f) — target by server charIndex (== `entity.index`). */
  partyInvite: (targetIndex: number) => getWydAPI()?.partyInvite({ targetIndex }),

  /** Party accept (0x3ab) — accept a pending invite from `inviterIndex`. */
  partyAccept: (inviterIndex: number, inviterName: string) =>
    getWydAPI()?.partyAccept({ inviterIndex, inviterName }),

  /** Party leave (0x37e) — leave / dissolve the current party. */
  partyLeave: () => getWydAPI()?.partyLeave(),

  sendChat: (message: string) => getWydAPI()?.sendMessage({ message }),

  sendWhisper: (target: string, message: string) =>
    getWydAPI()?.sendWhisper({ command: target, message }),

  charLogout: () => getWydAPI()?.charLogout(),

  loadServerlist: () => getWydAPI()?.loadServerlist(),

  getMachineBindingKey: () => getWydAPI()?.getMachineBindingKey(),
};
