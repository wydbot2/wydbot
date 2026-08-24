/**
 * Unit tests for `item.delete()` on inventory items — the deferred trash-bin
 * discard exposed to macro scripts via `buildCtxHandle` (script-ctx.ts).
 *
 * The `delete()` method is attached only to inventory items (`bag !== undefined`),
 * never to equipment. It captures a single deferred intent (last-call-wins) that
 * the engine flushes via `gameApi.itemDestroy` after the script ends. These
 * tests verify the wiring at the QuickJS boundary: the hook fires with the right
 * target and the method is present/absent per the inventory-vs-equipment rule.
 *
 * Wire/IPC coverage lives in game-api-destroy-restore.test.ts; this file covers
 * only the Script API surface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ViewItem } from '../../../../src/shared/types/item-types';

const { playerState } = vi.hoisted(() => ({
  playerState: {
    inventory: [] as (ViewItem | undefined)[],
    bagUnlock: [true, true, true, true],
    equip: [] as (ViewItem | undefined)[],
    currentHp: 100,
    maxHp: 100,
    currentMp: 100,
    maxMp: 100,
    movementSpeed: 1,
    position: { x: 0, y: 0 },
    lastTeleportMs: 0,
    mount: {
      equipped: false,
      itemId: 0,
      hp: 0,
      maxHp: 0,
      level: 0,
      vitality: 0,
      feed: 0,
      qualityLevel: 0,
    },
  },
}));

vi.mock('../../../../src/renderer/stores/player-store', () => ({
  usePlayerStore: { getState: () => playerState },
}));
vi.mock('../../../../src/renderer/stores/game-store', () => ({
  useGameStore: { getState: () => ({ entities: [] }) },
}));
// Normal item (VOLATILE grade 0x10) → useKind 'equip', so no `use()` collides
// with `delete()`.getItem returns a plain row; absent id → undefined.
vi.mock('../../../../src/renderer/lib/item-db', () => ({
  getItem: (id: number) =>
    id === 0 ? undefined : { itemClass: 0, effectSlots: [{ idx: 0x26, value: 0x10 }] },
}));

import { buildCtxHandle } from '../../../../src/renderer/lib/script-ctx';
import { runScript } from '../../../../src/renderer/lib/script-runtime';

const item = (id: number, name = `item${id}`): ViewItem =>
  ({ index: id, name, displayName: name, effects: [] }) as unknown as ViewItem;

const FREE = undefined;

describe('item.delete() — Script API surface', () => {
  beforeEach(() => {
    // Slot 5 (bag 0, slot 5) holds a Selo Élfico (2490); everything else empty.
    playerState.inventory = new Array(60).fill(FREE);
    playerState.inventory[5] = item(2490, 'Selo Élfico');
    // Second item in bag 1 (global slot 15 + 3 = 18).
    playerState.inventory[18] = item(709, 'Poção');
  });

  it('fires onDeleteItemRequest with the right target when called on a found item', async () => {
    const calls: { slot: number; bag: number; itemId: number }[] = [];
    await runScript(
      `const lixo = ctx.player.inventory.find(2490); if (lixo) lixo.delete();`,
      (qctx) => buildCtxHandle(qctx, { onDeleteItemRequest: (t) => calls.push(t) }),
    );
    expect(calls).toEqual([{ slot: 5, bag: 0, itemId: 2490 }]);
  });

  it('is present on inventory items (typeof === "function")', async () => {
    const result = await runScript(
      `const it = ctx.player.inventory.find(2490); return typeof it?.delete;`,
      (qctx) => buildCtxHandle(qctx),
    );
    expect(result).toBe('function');
  });

  it('is ABSENT on equipment items (typeof === "undefined")', async () => {
    playerState.equip = new Array(18).fill(FREE);
    // Slot 3 (weapon) equipped — no bag attached → delete() must not exist.
    playerState.equip[6] = item(2490, 'Arma Equipada');
    const result = await runScript(
      `const w = ctx.player.equipment.weapon; return typeof w?.delete;`,
      (qctx) => buildCtxHandle(qctx),
    );
    expect(result).toBe('undefined');
  });

  it('fires once per call in source order (macro-script.ts applies last-wins)', async () => {
    // The hook fires per-call at the QuickJS boundary; the single-intent
    // last-call-wins dedup lives in macro-script.ts (deleteItemIntent overwrite),
    // not here. We verify the call sequence so the consumer can implement it.
    const calls: { slot: number; bag: number; itemId: number }[] = [];
    await runScript(
      `const a = ctx.player.inventory.find(2490);
       const b = ctx.player.inventory.find(709);
       if (a) a.delete();
       if (b) b.delete();`,
      (qctx) => buildCtxHandle(qctx, { onDeleteItemRequest: (t) => calls.push(t) }),
    );
    expect(calls).toEqual([
      { slot: 5, bag: 0, itemId: 2490 },
      { slot: 3, bag: 1, itemId: 709 },
    ]);
  });

  it('does not fire when the item is not found (find returns null)', async () => {
    const calls: { slot: number; bag: number; itemId: number }[] = [];
    await runScript(
      `const ausente = ctx.player.inventory.find(9999);
       if (ausente) ausente.delete();`,
      (qctx) => buildCtxHandle(qctx, { onDeleteItemRequest: (t) => calls.push(t) }),
    );
    expect(calls).toEqual([]);
  });
});
