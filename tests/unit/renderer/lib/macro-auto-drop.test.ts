/** Auto-drop must destroy stacked items that match a rule, not skip them. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ViewItem, ViewItemEffect } from '../../../../src/shared/types/item-types';
import type { AutoDropRule } from '../../../../src/shared/app-config';

const { registerAmbientModule } = vi.hoisted(() => ({ registerAmbientModule: vi.fn() }));
const { itemDestroy } = vi.hoisted(() => ({
  itemDestroy: vi.fn((slot: number, _itemId: number) => {
    playerState.inventory[slot] = FREE;
  }),
}));
const { playerState, cfgState } = vi.hoisted(() => ({
  playerState: { inventory: [] as ViewItem[], inventoryFullSyncAt: 0 },
  cfgState: {
    config: { misc: { autoDrop: { enabled: true, rules: [] as AutoDropRule[] } } },
  },
}));

vi.mock('../../../../src/renderer/lib/macro-engine', () => ({ registerAmbientModule }));
vi.mock('../../../../src/renderer/lib/game-api', () => ({ gameApi: { itemDestroy } }));
vi.mock('../../../../src/renderer/lib/electron-api', () => ({
  getWydAPI: () => ({ onServerMessage: () => () => {} }),
}));
vi.mock('../../../../src/renderer/lib/macro-log', () => ({ logMacro: () => {} }));
vi.mock('../../../../src/renderer/lib/macro-events', () => ({ emitMacroEvent: () => {} }));
vi.mock('../../../../src/renderer/stores/player-store', () => ({
  usePlayerStore: { getState: () => playerState },
}));
vi.mock('../../../../src/renderer/stores/app-config-store', () => ({
  useAppConfigStore: { getState: () => cfgState },
}));

import '../../../../src/renderer/lib/macro-auto-drop';

type AmbientMod = { tick: (s: AbortSignal) => Promise<void>; reset: () => void };
const mod = registerAmbientModule.mock.calls[0][0] as AmbientMod;

const signal = { aborted: false } as AbortSignal;
const POTION = 415;
const BOW = 825;
/** Stand-in effect indexes (`MItemDefinition.SPECIALALL` / `DAMAGE` / `ATTSPEED`). */
const EF_SPECIALALL = 74;
const EF_DAMAGE = 2;
const EF_ATTSPEED = 26;
const EF_MAGIC = 60;
const FREE = { index: 0 } as unknown as ViewItem;
const eff = (index: number, value: number): ViewItemEffect => ({
  index,
  value,
  label: '',
  hidden: false,
  displayText: '',
  source: 'wire',
});
const effSrc = (
  index: number,
  value: number,
  source: ViewItemEffect['source'],
): ViewItemEffect => ({ ...eff(index, value), source });
const stack = (id: number, n: number): ViewItem =>
  ({ index: id, stackCount: n, effects: [] }) as unknown as ViewItem;
const withEffects = (id: number, effects: ViewItemEffect[]): ViewItem =>
  ({ index: id, stackCount: 1, effects }) as unknown as ViewItem;

/** Prime the snapshot on an empty slot, then let `item` arrive in it. */
const arrive = async (item: ViewItem): Promise<void> => {
  playerState.inventory = [FREE];
  await mod.tick(signal);
  playerState.inventory = [item];
  await mod.tick(signal);
};

describe('macro-auto-drop — stacked items', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [{ itemId: POTION, dropGroups: [] }] };
    playerState.inventory = [];
  });

  it('destroys a stacked item that matches a rule', async () => {
    await arrive(stack(POTION, 50));
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);
  });

  it('leaves a stacked item that matches no rule', async () => {
    cfgState.config.misc.autoDrop.rules = [{ itemId: 9999, dropGroups: [] }];
    await arrive(stack(POTION, 50));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('re-drops a same-id replacement landing in the same slot right after a destroy', async () => {
    playerState.inventory = [stack(POTION, 1)];
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);

    playerState.inventory = [stack(POTION, 1)];
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledTimes(2);
    expect(itemDestroy).toHaveBeenLastCalledWith(0, POTION);
  });
});

describe('macro-auto-drop — prime tick (pre-existing items)', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [{ itemId: POTION, dropGroups: [] }] };
    playerState.inventory = [];
  });

  it('drops a pre-existing blacklisted item on the first tick', async () => {
    playerState.inventory = [stack(POTION, 1)];
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);
  });

  it('skips non-blacklisted items on the first tick', async () => {
    cfgState.config.misc.autoDrop.rules = [{ itemId: 9999, dropGroups: [] }];
    playerState.inventory = [stack(POTION, 1)];
    await mod.tick(signal);
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('does NOT bulk-suppress on the prime tick (occupied slots are not a resync)', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: POTION, dropGroups: [] },
      { itemId: 416, dropGroups: [] },
      { itemId: 417, dropGroups: [] },
      { itemId: 418, dropGroups: [] },
      { itemId: 419, dropGroups: [] },
    ];
    playerState.inventory = [
      stack(POTION, 1),
      stack(416, 1),
      stack(417, 1),
      stack(418, 1),
      stack(419, 1),
    ];
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledTimes(2);
  });
});

describe('macro-auto-drop — rate-limited re-evaluation', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [{ itemId: POTION, dropGroups: [] }] };
    playerState.inventory = [];
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries rate-limited slots on the next tick', async () => {
    playerState.inventory = [
      stack(POTION, 1),
      stack(POTION, 1),
      stack(POTION, 1),
      stack(POTION, 1),
    ];
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledTimes(2);

    itemDestroy.mockClear();
    vi.advanceTimersByTime(1100);
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledTimes(2);
  });
});

describe('macro-auto-drop — rules change re-primes snapshot', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [] };
    playerState.inventory = [];
  });

  it('re-evaluates pre-existing inventory when rules change while running', async () => {
    // Prime with empty rules — potion stays in bag, snapshot is set.
    playerState.inventory = [stack(POTION, 1)];
    await mod.tick(signal);
    expect(itemDestroy).not.toHaveBeenCalled();

    // Same inventory, rules now blacklist the potion (config load / UI edit).
    // Without re-prime this would be a no-op: potion is not a new "arrival".
    cfgState.config.misc.autoDrop = {
      enabled: true,
      rules: [{ itemId: POTION, dropGroups: [] }],
    };
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);
  });

  it('does not re-drop when rules stay the same across ticks', async () => {
    cfgState.config.misc.autoDrop = {
      enabled: true,
      rules: [{ itemId: 9999, dropGroups: [] }],
    };
    playerState.inventory = [stack(POTION, 1)];
    await mod.tick(signal);
    expect(itemDestroy).not.toHaveBeenCalled();

    // Second tick, identical rules — snapshot already primed, no re-eval.
    await mod.tick(signal);
    expect(itemDestroy).not.toHaveBeenCalled();
  });
});

describe('macro-auto-drop — attr missing as 0', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = {
      enabled: true,
      rules: [{ itemId: POTION, dropGroups: [[{ index: EF_SPECIALALL, op: '<', value: 21 }]] }],
    };
    playerState.inventory = [];
  });

  it('drops when the attribute is missing (treated as 0 < threshold)', async () => {
    await arrive(withEffects(POTION, []));
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);
  });

  it('drops when the present value is below the threshold', async () => {
    await arrive(withEffects(POTION, [eff(EF_SPECIALALL, 15)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);
  });

  it('keeps when the present value is at/above the threshold', async () => {
    await arrive(withEffects(POTION, [eff(EF_SPECIALALL, 30)]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('keeps missing attr when the predicate requires >= 1', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: POTION, dropGroups: [[{ index: EF_SPECIALALL, op: '>=', value: 1 }]] },
    ];
    await arrive(withEffects(POTION, []));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('drops missing attr when the predicate is = 0', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: POTION, dropGroups: [[{ index: EF_SPECIALALL, op: '=', value: 0 }]] },
    ];
    await arrive(withEffects(POTION, []));
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);
  });

  it('AND: missing attr (0) must still satisfy its own predicate', async () => {
    cfgState.config.misc.autoDrop.rules = [
      {
        itemId: POTION,
        dropGroups: [
          [
            { index: EF_SPECIALALL, op: '>=', value: 1 },
            { index: EF_DAMAGE, op: '>=', value: 10 },
          ],
        ],
      },
    ];
    await arrive(withEffects(POTION, [eff(EF_DAMAGE, 50)]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('AND: missing attr (0) can satisfy a low threshold together with another attr', async () => {
    cfgState.config.misc.autoDrop.rules = [
      {
        itemId: POTION,
        dropGroups: [
          [
            { index: EF_SPECIALALL, op: '<', value: 21 },
            { index: EF_DAMAGE, op: '>=', value: 10 },
          ],
        ],
      },
    ];
    await arrive(withEffects(POTION, [eff(EF_DAMAGE, 50)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);
  });
});

describe('macro-auto-drop — wire-only matching (base/hardcoded ignored)', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [] };
    playerState.inventory = [];
  });

  it('matches only the ADD when base and wire share the same index', async () => {
    // Arco Divino shape: base "Aumento de Dano 258" + ADD "27", both DAMAGE=2.
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_DAMAGE, op: '<', value: 100 }]] },
    ];
    await arrive(withEffects(BOW, [effSrc(EF_DAMAGE, 258, 'base'), effSrc(EF_DAMAGE, 27, 'wire')]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });

  it('does NOT match a base-only attribute (reads as 0)', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_DAMAGE, op: '>=', value: 100 }]] },
    ];
    await arrive(withEffects(BOW, [effSrc(EF_DAMAGE, 258, 'base')]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('does NOT match hardcoded (refine) bonuses', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_DAMAGE, op: '>=', value: 1 }]] },
    ];
    await arrive(withEffects(BOW, [effSrc(EF_DAMAGE, 40, 'hardcoded')]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });
});

describe('macro-auto-drop — presence ops (absent/present)', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [] };
    playerState.inventory = [];
  });

  it('absent matches an item with no such wire ADD (base does not count)', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_DAMAGE, op: 'absent', value: 0 }]] },
    ];
    await arrive(withEffects(BOW, [effSrc(EF_DAMAGE, 258, 'base')]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });

  it('absent does NOT match when the wire ADD exists', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_DAMAGE, op: 'absent', value: 0 }]] },
    ];
    await arrive(withEffects(BOW, [eff(EF_DAMAGE, 27)]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('present matches only when the wire ADD exists', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_DAMAGE, op: 'present', value: 0 }]] },
    ];
    await arrive(withEffects(BOW, [eff(EF_DAMAGE, 27)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });

  it('present does NOT match a base-only attribute', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_DAMAGE, op: 'present', value: 0 }]] },
    ];
    await arrive(withEffects(BOW, [effSrc(EF_DAMAGE, 258, 'base')]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });
});

describe('macro-auto-drop — keep group (protection veto)', () => {
  const EF_CRITICAL = 42;

  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = {
      enabled: true,
      rules: [
        {
          itemId: BOW,
          dropGroups: [
            [
              { index: EF_SPECIALALL, op: '<', value: 21 },
              { index: EF_DAMAGE, op: 'absent', value: 0 },
            ],
          ],
          keepGroups: [[{ index: EF_CRITICAL, op: '>=', value: 10 }]],
        },
      ],
    };
    playerState.inventory = [];
  });

  it('drops when delete group matches and keep group does NOT fully match', async () => {
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 12)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });

  it('keeps when BOTH groups match (protection has priority)', async () => {
    // CRITICAL is percent-format: internal 150 = tooltip "15.0%" (>= 10).
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 12), eff(EF_CRITICAL, 150)]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('keeps when delete group does not match, regardless of keep group', async () => {
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 30), eff(EF_CRITICAL, 150)]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('empty keepGroups protects nothing', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_SPECIALALL, op: '<', value: 21 }]], keepGroups: [] },
    ];
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 12)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });
});

describe('macro-auto-drop — drop groups (OR of ANDs)', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    // A || (B && C): skill <= 21 OR (no damage ADD AND no magic ADD).
    cfgState.config.misc.autoDrop = {
      enabled: true,
      rules: [
        {
          itemId: BOW,
          dropGroups: [
            [{ index: EF_SPECIALALL, op: '<=', value: 21 }],
            [
              { index: EF_DAMAGE, op: 'absent', value: 0 },
              { index: EF_MAGIC, op: 'absent', value: 0 },
            ],
          ],
        },
      ],
    };
    playerState.inventory = [];
  });

  it('drops when only the FIRST group matches (skill low, has damage ADD)', async () => {
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 12), eff(EF_DAMAGE, 27)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });

  it('drops when only the SECOND group matches (skill high, no offensive ADDs)', async () => {
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 30)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });

  it('keeps when NO group matches (skill high AND has damage ADD)', async () => {
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 30), eff(EF_DAMAGE, 27)]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('veto still wins when a drop group matches', async () => {
    cfgState.config.misc.autoDrop.rules[0].keepGroups = [
      [{ index: EF_SPECIALALL, op: '>=', value: 39 }],
    ];
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 40)]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });
});

describe('macro-auto-drop — tooltip units for percent attrs (ATTSPEED)', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [] };
    playerState.inventory = [];
  });

  /**
   * Customer case: Arco Divino #825 with tooltip "Aprendizagem 9" + "Vel. 11.0%"
   * (internal ATTSPEED 110). Rule uses tooltip numbers: learning < 21 AND speed < 50.
   */
  it('drops bow when learning < 21 and attack-speed % < 50 (tooltip units)', async () => {
    cfgState.config.misc.autoDrop.rules = [
      {
        itemId: BOW,
        dropGroups: [
          [
            { index: EF_SPECIALALL, op: '<', value: 21 },
            { index: EF_ATTSPEED, op: '<', value: 50 },
          ],
        ],
      },
    ];
    await arrive(withEffects(BOW, [eff(EF_SPECIALALL, 9), eff(EF_ATTSPEED, 110)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });

  it('keeps when attack-speed tooltip % is at/above the threshold', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_ATTSPEED, op: '<', value: 11 }]] },
    ];
    await arrive(withEffects(BOW, [eff(EF_ATTSPEED, 110)]));
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('drops when attack-speed tooltip % is strictly below threshold', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_ATTSPEED, op: '<', value: 12 }]] },
    ];
    await arrive(withEffects(BOW, [eff(EF_ATTSPEED, 110)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });

  it('drops when attack-speed tooltip % equals rule with <=', async () => {
    cfgState.config.misc.autoDrop.rules = [
      { itemId: BOW, dropGroups: [[{ index: EF_ATTSPEED, op: '<=', value: 11 }]] },
    ];
    await arrive(withEffects(BOW, [eff(EF_ATTSPEED, 110)]));
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });
});

describe('macro-auto-drop — full-bag sweep (no stall)', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [{ itemId: POTION, dropGroups: [] }] };
    playerState.inventory = [];
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => vi.useRealTimers());

  it('sweeps all identical items when starting at the stall threshold (8)', async () => {
    playerState.inventory = Array.from({ length: 8 }, () => stack(POTION, 1));
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(i * 1100);
      await mod.tick(signal);
    }
    expect(itemDestroy).toHaveBeenCalledTimes(8);
  });

  it('sweeps a large backlog (20 items)', async () => {
    playerState.inventory = Array.from({ length: 20 }, () => stack(POTION, 1));
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(i * 1100);
      await mod.tick(signal);
    }
    expect(itemDestroy).toHaveBeenCalledTimes(20);
  });

  it('sweeps distinct matching items when starting full', async () => {
    const ids = [416, 417, 418, 419, 420, 421, 422, 423];
    cfgState.config.misc.autoDrop.rules = ids.map((id) => ({ itemId: id, dropGroups: [] }));
    playerState.inventory = ids.map((id) => stack(id, 1));
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(i * 1100);
      await mod.tick(signal);
    }
    expect(itemDestroy).toHaveBeenCalledTimes(8);
  });

  it('sweeps the predominant matching item in a mixed bag (non-matching items ignored)', async () => {
    playerState.inventory = [
      stack(POTION, 1),
      stack(9001, 1),
      stack(POTION, 1),
      stack(9002, 1),
      stack(POTION, 1),
      stack(9003, 1),
      stack(POTION, 1),
      stack(9004, 1),
      stack(POTION, 1),
      stack(POTION, 1),
    ];
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(i * 1100);
      await mod.tick(signal);
    }
    expect(itemDestroy).toHaveBeenCalledTimes(6);
    const destroyedIds = itemDestroy.mock.calls.map((c) => c[1]);
    expect(destroyedIds.every((id) => id === POTION)).toBe(true);
  });

  it('respects the 2/sec rate limit during the sweep', async () => {
    playerState.inventory = Array.from({ length: 6 }, () => stack(POTION, 1));
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledTimes(2);
    vi.setSystemTime(500);
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledTimes(2);
    vi.setSystemTime(1100);
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledTimes(4);
  });

  it('does not re-target slots already destroyed during the sweep', async () => {
    playerState.inventory = Array.from({ length: 8 }, () => stack(POTION, 1));
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(i * 1100);
      await mod.tick(signal);
    }
    const slots = itemDestroy.mock.calls.map((c) => c[0]);
    expect(new Set(slots).size).toBe(8);
    expect(slots).toHaveLength(8);
  });
});

describe('macro-auto-drop — full-sync suppression (ground truth 0x114)', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [] };
    playerState.inventory = [];
    playerState.inventoryFullSyncAt = 0;
  });

  it('suppresses evaluation when a full inventory sync lands between ticks', async () => {
    const ids = [416, 417, 418, 419, 420];
    cfgState.config.misc.autoDrop.rules = ids.map((id) => ({ itemId: id, dropGroups: [] }));
    playerState.inventory = ids.map(() => FREE);
    await mod.tick(signal); // prime tick — adopts the current watermark (0)
    playerState.inventory = ids.map((id) => stack(id, 1));
    playerState.inventoryFullSyncAt = 1; // server re-presented the whole grid
    await mod.tick(signal);
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('does not re-evaluate adopted resync content on later ticks', async () => {
    cfgState.config.misc.autoDrop.rules = [{ itemId: POTION, dropGroups: [] }];
    playerState.inventory = Array.from({ length: 5 }, () => FREE);
    await mod.tick(signal);
    playerState.inventory = Array.from({ length: 5 }, () => stack(POTION, 1));
    playerState.inventoryFullSyncAt = 1;
    await mod.tick(signal);
    await mod.tick(signal);
    expect(itemDestroy).not.toHaveBeenCalled();
  });

  it('a module started after world-enter does NOT treat the entry as a fresh resync', async () => {
    cfgState.config.misc.autoDrop.rules = [{ itemId: POTION, dropGroups: [] }];
    playerState.inventoryFullSyncAt = 12345; // world-enter predates the module start
    playerState.inventory = [stack(POTION, 1)];
    await mod.tick(signal); // prime tick evaluates normally
    expect(itemDestroy).toHaveBeenCalledWith(0, POTION);
  });

  it('keeps the rate-limit backlog across a full-sync tick', async () => {
    cfgState.config.misc.autoDrop.rules = [{ itemId: POTION, dropGroups: [] }];
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      playerState.inventory = Array.from({ length: 4 }, () => stack(POTION, 1));
      await mod.tick(signal); // 2 destroyed, 2 parked in pendingSweep
      expect(itemDestroy).toHaveBeenCalledTimes(2);

      playerState.inventoryFullSyncAt = 1; // resync tick — backlog must survive
      await mod.tick(signal);
      expect(itemDestroy).toHaveBeenCalledTimes(2);

      vi.setSystemTime(1100); // next normal tick re-evaluates the backlog
      await mod.tick(signal);
      expect(itemDestroy).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('macro-auto-drop — organic loot bursts (no count breaker)', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [] };
    playerState.inventory = [];
    playerState.inventoryFullSyncAt = 0;
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => vi.useRealTimers());

  it('drops a 5-item organic burst (rate-limited sweep, never suppressed)', async () => {
    cfgState.config.misc.autoDrop.rules = [{ itemId: POTION, dropGroups: [] }];
    playerState.inventory = Array.from({ length: 5 }, () => FREE);
    await mod.tick(signal);
    playerState.inventory = Array.from({ length: 5 }, () => stack(POTION, 1));
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledTimes(2); // rate limit, not suppression
    for (let i = 1; i <= 3; i++) {
      vi.setSystemTime(i * 1100);
      await mod.tick(signal);
    }
    expect(itemDestroy).toHaveBeenCalledTimes(5);
  });
});

describe('macro-auto-drop — same-slot item swap', () => {
  beforeEach(() => {
    mod.reset();
    itemDestroy.mockReset();
    cfgState.config.misc.autoDrop = { enabled: true, rules: [] };
    playerState.inventory = [];
    playerState.inventoryFullSyncAt = 0;
  });

  it('treats a different item landing in an occupied slot as an arrival', async () => {
    cfgState.config.misc.autoDrop.rules = [{ itemId: BOW, dropGroups: [] }];
    playerState.inventory = [stack(9999, 1)]; // kept item (no rule)
    await mod.tick(signal);
    expect(itemDestroy).not.toHaveBeenCalled();

    playerState.inventory = [stack(BOW, 1)]; // swapped within the inter-tick gap
    await mod.tick(signal);
    expect(itemDestroy).toHaveBeenCalledWith(0, BOW);
  });
});
