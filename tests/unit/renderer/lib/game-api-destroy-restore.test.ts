/** itemDestroy: optimistic clear + restore on ITEM_DESTROY_FAILED (queue stale-drop). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ViewItem } from '../../../../src/shared/types/item-types';
import type { IpcItemDestroyFailed } from '../../../../src/shared/ipc/ipc-api';

const { api, playerState, store, listeners } = vi.hoisted(() => {
  const state = { inventory: [] as ViewItem[] };
  const cbs: { fail?: (d: IpcItemDestroyFailed) => void } = {};
  return {
    listeners: cbs,
    api: {
      itemDestroy: vi.fn(),
      onItemDestroyFailed: vi.fn((cb: (d: IpcItemDestroyFailed) => void) => {
        cbs.fail = cb;
        return () => {};
      }),
    },
    playerState: state,
    store: {
      clearInventorySlot: vi.fn((slot: number) => {
        state.inventory[slot] = { index: 0 } as unknown as ViewItem;
      }),
      updateInventorySlot: vi.fn((slot: number, item: ViewItem) => {
        state.inventory[slot] = item;
      }),
    },
  };
});

vi.mock('../../../../src/renderer/lib/electron-api', () => ({ getWydAPI: () => api }));
vi.mock('../../../../src/renderer/lib/move-echo-bus', () => ({
  onMoveEcho: vi.fn(),
  onMoveEnqueued: vi.fn(),
  onMoveRejected: vi.fn(),
  MoveRejectedError: class extends Error {},
}));
vi.mock('../../../../src/renderer/lib/scroll-echo-bus', () => ({
  onTeleportScrollDone: vi.fn(),
  ScrollRejectedError: class extends Error {},
}));
vi.mock('../../../../src/renderer/stores/player-store', () => ({
  usePlayerStore: { getState: () => ({ inventory: playerState.inventory, ...store }) },
}));

import { gameApi } from '../../../../src/renderer/lib/game-api';

const POTION = 415;
const stack = (id: number, n: number): ViewItem =>
  ({ index: id, stackCount: n, effects: [] }) as unknown as ViewItem;
const FREE = { index: 0 } as unknown as ViewItem;

const failCb = (): ((d: IpcItemDestroyFailed) => void) => {
  if (!listeners.fail) throw new Error('failure listener not armed');
  return listeners.fail;
};

describe('gameApi.itemDestroy — optimistic clear + stale-drop restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerState.inventory = [stack(POTION, 3)];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the slot optimistically on emit', () => {
    gameApi.itemDestroy(0, POTION);
    expect(api.itemDestroy).toHaveBeenCalledWith({ slot: 0, itemId: POTION });
    expect(store.clearInventorySlot).toHaveBeenCalledWith(0);
    expect(playerState.inventory[0].index).toBe(0);
  });

  it('restores the stashed item when main reports a queue stale-drop', () => {
    gameApi.itemDestroy(0, POTION);
    failCb()({ slot: 0, itemId: POTION, reason: 'queue-stale' });
    expect(store.updateInventorySlot).toHaveBeenCalledWith(0, stack(POTION, 3));
    expect(playerState.inventory[0].index).toBe(POTION);
    expect(playerState.inventory[0].stackCount).toBe(3);
  });

  it('does NOT restore when the slot was re-occupied by new loot', () => {
    gameApi.itemDestroy(0, POTION);
    playerState.inventory[0] = stack(9999, 1); // new loot landed meanwhile
    store.updateInventorySlot.mockClear();
    failCb()({ slot: 0, itemId: POTION, reason: 'queue-stale' });
    expect(store.updateInventorySlot).not.toHaveBeenCalled();
    expect(playerState.inventory[0].index).toBe(9999);
  });

  it('ignores a failure whose itemId does not match the stash', () => {
    gameApi.itemDestroy(0, POTION);
    playerState.inventory[0] = FREE;
    store.updateInventorySlot.mockClear();
    failCb()({ slot: 0, itemId: 9999, reason: 'queue-stale' });
    expect(store.updateInventorySlot).not.toHaveBeenCalled();
  });

  it('ignores a failure arriving after the stash TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    gameApi.itemDestroy(0, POTION);
    playerState.inventory[0] = FREE;
    store.updateInventorySlot.mockClear();
    vi.setSystemTime(1_000_000 + 16_000); // > 15s TTL
    failCb()({ slot: 0, itemId: POTION, reason: 'queue-stale' });
    expect(store.updateInventorySlot).not.toHaveBeenCalled();
  });
});
