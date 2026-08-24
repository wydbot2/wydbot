/** Auto-mount-feed: feeds via user-configured ração actions (branch A HP% + branch B feed ∈ 1..5). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ViewItem } from '@shared/types/item-types';
import type { HealAction } from '@shared/app-config/v1/sections/auto-healing';

const { registerAmbientModule } = vi.hoisted(() => ({ registerAmbientModule: vi.fn() }));
const { useItem } = vi.hoisted(() => ({ useItem: vi.fn() }));
const { cfgState, playerState } = vi.hoisted(() => ({
  cfgState: {
    config: {
      misc: {
        autoHealing: {
          enabled: true,
          mountFeed: { enabled: true, thresholdPct: 30, actions: [] as HealAction[] },
        },
      },
    },
  },
  playerState: {
    mount: {
      equipped: true,
      itemId: 0x91a,
      hp: 1000,
      maxHp: 5000,
      feed: 3,
      level: 0,
      vitality: 0,
      qualityLevel: 0,
    },
    inventory: [] as (ViewItem | undefined)[],
  },
}));

vi.mock('../../../../src/renderer/lib/macro-engine', () => ({ registerAmbientModule }));
vi.mock('../../../../src/renderer/lib/game-api', () => ({ gameApi: { useItem } }));
vi.mock('../../../../src/renderer/lib/macro-log', () => ({ logMacro: () => {} }));
vi.mock('../../../../src/renderer/stores/app-config-store', () => ({
  useAppConfigStore: { getState: () => cfgState },
}));
vi.mock('../../../../src/renderer/stores/player-store', () => ({
  usePlayerStore: { getState: () => playerState },
}));

import '../../../../src/renderer/lib/macro-auto-mount-feed';

type AmbientMod = { tick: (s: AbortSignal) => Promise<void>; reset: () => void };
const mod = registerAmbientModule.mock.calls[0][0] as AmbientMod;
const signal = { aborted: false } as AbortSignal;

const MOUNT = 0x91a;
const FOOD = 0x974; // valid pair for 0x91a (cluster A)
const FOOD_WRONG_MOUNT = 0x975; // valid for 0x91b, NOT for 0x91a
const T0 = 1_000_000;

const makeItem = (index: number): ViewItem => ({
  index,
  name: `item-${index}`,
  displayName: `item-${index}`,
  effects: [],
});

const emptyBag = (): (ViewItem | undefined)[] => Array.from({ length: 60 }, () => undefined);

const cfg = () => cfgState.config.misc.autoHealing;
const feedCfg = () => cfg().mountFeed;
const withFood = (...ids: number[]): void => {
  feedCfg().actions = ids.map((refId) => ({ kind: 'item', refId }) as HealAction);
};

describe('macro-auto-mount-feed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    mod.reset();
    useItem.mockReset().mockReturnValue(true);
    cfg().enabled = true;
    cfg().mountFeed = { enabled: true, thresholdPct: 30, actions: [{ kind: 'item', refId: FOOD }] };
    playerState.mount = {
      equipped: true,
      itemId: MOUNT,
      hp: 1000,
      maxHp: 5000,
      feed: 3,
      level: 0,
      vitality: 0,
      qualityLevel: 0,
    };
    playerState.inventory = emptyBag();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('feed in 1..5 feeds with the configured ração found in the bag', async () => {
    playerState.inventory[7] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).toHaveBeenCalledTimes(1);
    expect(useItem).toHaveBeenCalledWith(7, FOOD, 0xe);
  });

  it('feed in 1..5 does NOTHING without configured actions (cadastro obrigatório)', async () => {
    feedCfg().actions = [];
    playerState.inventory[0] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).not.toHaveBeenCalled();
  });

  it('feed in 1..5 does NOTHING when the configured ração is not in the bag (even if other valid food exists)', async () => {
    withFood(FOOD);
    playerState.inventory[0] = makeItem(0xd28); // valid for 0x91a but NOT configured
    await mod.tick(signal);
    expect(useItem).not.toHaveBeenCalled();
  });

  it('skips configured actions that fail the mount whitelist', async () => {
    withFood(FOOD_WRONG_MOUNT, FOOD);
    playerState.inventory[0] = makeItem(FOOD_WRONG_MOUNT);
    playerState.inventory[2] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).toHaveBeenCalledWith(2, FOOD, 0xe);
  });

  it('feed=6 does not trigger branch B; HP above threshold does not trigger branch A', async () => {
    playerState.mount.feed = 6;
    playerState.mount.hp = 3000;
    playerState.inventory[0] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).not.toHaveBeenCalled();
  });

  it('feed=0 does not trigger (canonical unsigned-wrap semantics)', async () => {
    playerState.mount.feed = 0;
    playerState.mount.hp = 3000;
    playerState.inventory[0] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).not.toHaveBeenCalled();
  });

  it('branch A fires when HP < thresholdPct * maxHp even with feed > 5', async () => {
    playerState.mount.feed = 50;
    playerState.mount.hp = 1000;
    playerState.inventory[3] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).toHaveBeenCalledWith(3, FOOD, 0xe);
  });

  it('respects the 500ms cooldown between feeds', async () => {
    playerState.inventory[0] = makeItem(FOOD);
    await mod.tick(signal);
    await mod.tick(signal);
    expect(useItem).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 500);
    await mod.tick(signal);
    expect(useItem).toHaveBeenCalledTimes(2);
  });

  it('does nothing without an equipped mount', async () => {
    playerState.mount.equipped = false;
    playerState.inventory[0] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).not.toHaveBeenCalled();
  });

  it('does nothing when mountFeed is disabled', async () => {
    feedCfg().enabled = false;
    playerState.inventory[0] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).not.toHaveBeenCalled();
  });

  it('does nothing when autoHealing master is disabled', async () => {
    cfg().enabled = false;
    playerState.inventory[0] = makeItem(FOOD);
    await mod.tick(signal);
    expect(useItem).not.toHaveBeenCalled();
  });
});
