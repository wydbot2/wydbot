/**
 * Auto-stack merges partial stacks of the same item and skips anything flagged
 * immovable / non-transferable / bound (never groupable). No persistent state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ViewItem } from '../../../../src/shared/types/item-types';

const { registerAmbientModule } = vi.hoisted(() => ({ registerAmbientModule: vi.fn() }));
const { itemMove } = vi.hoisted(() => ({ itemMove: vi.fn() }));
const { stackCapOf } = vi.hoisted(() => ({ stackCapOf: vi.fn(() => 120) }));
const { logMacro } = vi.hoisted(() => ({ logMacro: vi.fn() }));
const { playerState, cfgState } = vi.hoisted(() => ({
  playerState: { inventory: [] as ViewItem[], bagUnlock: [] as boolean[] },
  cfgState: { config: { misc: { autoStack: { enabled: true } } } },
}));

vi.mock('../../../../src/renderer/lib/macro-engine', () => ({ registerAmbientModule }));
vi.mock('../../../../src/renderer/lib/game-api', () => ({ gameApi: { itemMove } }));
vi.mock('../../../../src/renderer/lib/item-stack-utils', () => ({ stackCapOf }));
vi.mock('../../../../src/renderer/lib/macro-log', () => ({ logMacro }));
vi.mock('../../../../src/renderer/components/game/personagem/character-tables', () => ({
  BAG_SIZE: 30,
  isBagLocked: () => false,
}));
vi.mock('../../../../src/renderer/stores/player-store', () => ({
  usePlayerStore: { getState: () => playerState },
}));
vi.mock('../../../../src/renderer/stores/app-config-store', () => ({
  useAppConfigStore: { getState: () => cfgState },
}));

import '../../../../src/renderer/lib/macro-auto-stack';

type AmbientMod = { tick: (s: AbortSignal) => Promise<void>; reset: () => void };
const mod = registerAmbientModule.mock.calls[0][0] as AmbientMod;

const signal = { aborted: false } as AbortSignal;
const ID = 100;
const FREE = { index: 0 } as unknown as ViewItem;
const stk = (n: number): ViewItem =>
  ({ index: ID, stackCount: n, refineLevel: 0, displayName: 'Poção' }) as unknown as ViewItem;
const TWO_PARTIALS = (): ViewItem[] => [stk(1), stk(1)];
const MERGED = (): ViewItem[] => [FREE, stk(2)]; // src(slot0) emptied, dst(slot1) grew

describe('macro-auto-stack', () => {
  beforeEach(() => {
    mod.reset();
    itemMove.mockReset();
    logMacro.mockReset();
    stackCapOf.mockReturnValue(120);
    cfgState.config.misc.autoStack = { enabled: true };
    playerState.inventory = [];
  });

  it('merges a partial pair and logs the consolidation', async () => {
    playerState.inventory = TWO_PARTIALS();
    await mod.tick(signal);
    expect(itemMove).toHaveBeenCalledTimes(1);
    playerState.inventory = MERGED();
    await mod.tick(signal); // verify: merged
    expect(logMacro).toHaveBeenCalledWith('info', expect.stringContaining('consolidado'));
  });

  it('queues the next mergeable pair the SAME tick a merge confirms (2x throughput)', async () => {
    const item = (id: number, n = 1): ViewItem =>
      ({
        index: id,
        stackCount: n,
        refineLevel: 0,
        displayName: `Item${id}`,
      }) as unknown as ViewItem;
    // Two independent groups: A (id 100) at slots 0-1, B (id 200) at slots 2-3.
    playerState.inventory = [item(100), item(100), item(200), item(200)];
    await mod.tick(signal); // sends move for group A
    expect(itemMove).toHaveBeenCalledTimes(1);
    playerState.inventory = [FREE, item(100, 2), item(200), item(200)]; // A merged; B still partial
    await mod.tick(signal); // verify A = merged → fall through → send move for group B
    expect(itemMove).toHaveBeenCalledTimes(2);
  });

  it('never auto-stacks an item flagged immovable / non-transferable', async () => {
    const naoTransferivel = {
      index: ID,
      stackCount: 1,
      refineLevel: 0,
      displayName: 'Não Transferível',
      immovable: 2, // tier 2 — must be skipped just like tier 1/3
    } as unknown as ViewItem;
    playerState.inventory = [naoTransferivel, naoTransferivel];
    await mod.tick(signal);
    await mod.tick(signal);
    expect(itemMove).not.toHaveBeenCalled();
  });

  it('re-attempts a pair that did not merge (no persistent block)', async () => {
    playerState.inventory = TWO_PARTIALS();
    await mod.tick(signal); // move 1
    await mod.tick(signal); // verify: unchanged → clears pending (no block)
    await mod.tick(signal); // same pair still present → retried
    expect(itemMove).toHaveBeenCalledTimes(2);
  });

  it('reset() drops the in-flight pending', async () => {
    playerState.inventory = TWO_PARTIALS();
    await mod.tick(signal); // move, pending set
    mod.reset();
    playerState.inventory = TWO_PARTIALS();
    await mod.tick(signal); // pending cleared → plans fresh → move again
    expect(itemMove).toHaveBeenCalledTimes(2);
  });
});
