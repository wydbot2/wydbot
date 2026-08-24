/** Auto-group: invite (leader) or accept (accept) whitelisted players only. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { registerAmbientModule } = vi.hoisted(() => ({ registerAmbientModule: vi.fn() }));
const { partyInvite, partyAccept } = vi.hoisted(() => ({
  partyInvite: vi.fn(),
  partyAccept: vi.fn(),
}));
const { removeInvite } = vi.hoisted(() => ({ removeInvite: vi.fn() }));
const { gameState, cfgState, partyState, group } = vi.hoisted(() => ({
  gameState: {
    entities: [] as { index: number; name: string }[],
  },
  cfgState: {
    config: {
      misc: {
        autoGroup: { enabled: true, mode: 'leader', whitelist: [] as { name: string }[] },
      },
    },
  },
  partyState: {
    pendingInvites: [] as { inviterIndex: number; inviterName: string; receivedAtMs: number }[],
    removeInvite,
  },
  group: { names: new Set<string>() },
}));

vi.mock('../../../../src/renderer/lib/macro-engine', () => ({ registerAmbientModule }));
vi.mock('../../../../src/renderer/lib/game-api', () => ({ gameApi: { partyInvite, partyAccept } }));
vi.mock('../../../../src/renderer/lib/macro-log', () => ({ logMacro: () => {} }));
vi.mock('../../../../src/renderer/lib/entity-selectors', () => ({
  getOtherPlayers: () => gameState.entities,
}));
vi.mock('../../../../src/renderer/lib/group-membership', () => ({
  getGroupMemberNames: () => group.names,
}));
vi.mock('../../../../src/renderer/stores/app-config-store', () => ({
  useAppConfigStore: { getState: () => cfgState },
}));
vi.mock('../../../../src/renderer/stores/party-store', () => ({
  usePartyStore: { getState: () => partyState },
}));

import '../../../../src/renderer/lib/macro-auto-group';

type AmbientMod = { tick: (s: AbortSignal) => Promise<void>; reset: () => void };
const mod = registerAmbientModule.mock.calls[0][0] as AmbientMod;
const signal = { aborted: false } as AbortSignal;
const player = (index: number, name: string) => ({ index, name });

describe('macro-auto-group', () => {
  beforeEach(() => {
    mod.reset();
    partyInvite.mockReset();
    partyAccept.mockReset();
    removeInvite.mockReset();
    group.names = new Set();
    gameState.entities = [];
    partyState.pendingInvites = [];
    cfgState.config.misc.autoGroup = { enabled: true, mode: 'leader', whitelist: [] };
  });

  it('leader: invites a whitelisted nearby player once (per-target cooldown)', async () => {
    cfgState.config.misc.autoGroup.whitelist = [{ name: 'Re-No-Quibe' }];
    gameState.entities = [player(262, 'Re-No-Quibe')];
    await mod.tick(signal);
    await mod.tick(signal); // within cooldown → still once
    expect(partyInvite).toHaveBeenCalledTimes(1);
    expect(partyInvite).toHaveBeenCalledWith(262);
  });

  it('leader: ignores a non-whitelisted player', async () => {
    cfgState.config.misc.autoGroup.whitelist = [{ name: 'SomeoneElse' }];
    gameState.entities = [player(262, 'Re-No-Quibe')];
    await mod.tick(signal);
    expect(partyInvite).not.toHaveBeenCalled();
  });

  it('leader: skips a whitelisted player already in the party', async () => {
    cfgState.config.misc.autoGroup.whitelist = [{ name: 'Re-No-Quibe' }];
    gameState.entities = [player(262, 'Re-No-Quibe')];
    group.names = new Set(['re-no-quibe']);
    await mod.tick(signal);
    expect(partyInvite).not.toHaveBeenCalled();
  });

  it('accept: accepts a whitelisted inviter and drops the invite', async () => {
    cfgState.config.misc.autoGroup = {
      enabled: true,
      mode: 'accept',
      whitelist: [{ name: 'eguaManeira' }],
    };
    partyState.pendingInvites = [
      { inviterIndex: 254, inviterName: 'eguaManeira', receivedAtMs: 0 },
    ];
    await mod.tick(signal);
    expect(partyAccept).toHaveBeenCalledWith(254, 'eguaManeira');
    expect(removeInvite).toHaveBeenCalledWith(254);
  });

  it('accept: ignores an invite from a non-whitelisted inviter', async () => {
    cfgState.config.misc.autoGroup = {
      enabled: true,
      mode: 'accept',
      whitelist: [{ name: 'eguaManeira' }],
    };
    partyState.pendingInvites = [{ inviterIndex: 999, inviterName: 'Stranger', receivedAtMs: 0 }];
    await mod.tick(signal);
    expect(partyAccept).not.toHaveBeenCalled();
  });
});
