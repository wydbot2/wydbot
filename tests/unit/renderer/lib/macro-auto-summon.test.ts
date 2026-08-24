/** Auto-summon: single-pick pet re-summon on the canonical fixed 80 s timer. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { registerAmbientModule } = vi.hoisted(() => ({ registerAmbientModule: vi.fn() }));
const { castBuff } = vi.hoisted(() => ({ castBuff: vi.fn() }));
const { skillDb, cfgState } = vi.hoisted(() => ({
  skillDb: new Map<number, { id: number; name: string | null; row: { packetKind: number } }>(),
  cfgState: {
    config: {
      misc: { autoSummon: { enabled: true, skill: null as number | null } },
    },
  },
}));

vi.mock('../../../../src/renderer/lib/macro-engine', () => ({ registerAmbientModule }));
vi.mock('../../../../src/renderer/lib/game-api', () => ({ gameApi: { castBuff } }));
vi.mock('../../../../src/renderer/lib/macro-log', () => ({ logMacro: () => {} }));
vi.mock('../../../../src/renderer/lib/macro-events', () => ({ emitMacroEvent: () => {} }));
vi.mock('../../../../src/renderer/lib/item-db', () => ({
  getSkill: (id: number) => skillDb.get(id),
}));
vi.mock('../../../../src/renderer/stores/app-config-store', () => ({
  useAppConfigStore: { getState: () => cfgState },
}));

import '../../../../src/renderer/lib/macro-auto-summon';

type AmbientMod = { tick: (s: AbortSignal) => Promise<void>; reset: () => void };
const mod = registerAmbientModule.mock.calls[0][0] as AmbientMod;
const signal = { aborted: false } as AbortSignal;

const CONDOR = 0x38;
const URSO = 0x3b;
const T0 = 1_000_000;

describe('macro-auto-summon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    mod.reset();
    castBuff.mockReset();
    skillDb.clear();
    skillDb.set(CONDOR, { id: CONDOR, name: 'Evocar Condor', row: { packetKind: 1 } });
    skillDb.set(URSO, { id: URSO, name: 'Evocar Urso Selvagem', row: { packetKind: 1 } });
    cfgState.config.misc.autoSummon = { enabled: true, skill: CONDOR };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('casts the chosen summon via the packetKind-1 self-target route', async () => {
    await mod.tick(signal);
    expect(castBuff).toHaveBeenCalledTimes(1);
    expect(castBuff).toHaveBeenCalledWith(CONDOR, 1);
  });

  it('holds the fixed 80 s recast — no recast at 79 s, recast at 80 s', async () => {
    await mod.tick(signal);
    vi.setSystemTime(T0 + 79_000);
    await mod.tick(signal);
    expect(castBuff).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 80_000);
    await mod.tick(signal);
    expect(castBuff).toHaveBeenCalledTimes(2);
  });

  it('swapping the configured summon re-casts immediately', async () => {
    await mod.tick(signal);
    cfgState.config.misc.autoSummon.skill = URSO;
    await mod.tick(signal);
    expect(castBuff).toHaveBeenCalledTimes(2);
    expect(castBuff).toHaveBeenLastCalledWith(URSO, 1);
  });

  it('no cast when disabled or when no summon is chosen', async () => {
    cfgState.config.misc.autoSummon = { enabled: false, skill: CONDOR };
    await mod.tick(signal);
    cfgState.config.misc.autoSummon = { enabled: true, skill: null };
    await mod.tick(signal);
    expect(castBuff).not.toHaveBeenCalled();
  });

  it('no cast for an id missing from the skill db', async () => {
    cfgState.config.misc.autoSummon = { enabled: true, skill: 0x3f };
    await mod.tick(signal);
    expect(castBuff).not.toHaveBeenCalled();
  });

  it('reset clears the timer — next tick casts again', async () => {
    await mod.tick(signal);
    mod.reset();
    await mod.tick(signal);
    expect(castBuff).toHaveBeenCalledTimes(2);
  });

  it('routes packetKind !== 1 through the generic (0x367) path', async () => {
    skillDb.set(CONDOR, { id: CONDOR, name: 'Evocar Condor', row: { packetKind: 0 } });
    await mod.tick(signal);
    expect(castBuff).toHaveBeenCalledWith(CONDOR, 0);
  });
});
