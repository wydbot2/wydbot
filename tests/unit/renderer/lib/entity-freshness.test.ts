import { describe, expect, it } from 'vitest';
import {
  isEntityActionable,
  isEntityFresh,
  isEntityPresent,
} from '../../../../src/renderer/lib/entity-freshness';
import type { MonsterEntity, NpcEntity } from '../../../../src/shared/types';
import type { MScore } from '../../../../src/shared/types/game-structures';

const score = (over: Partial<MScore> = {}): MScore => ({
  level: 1,
  defense: 0,
  damage: 0,
  merchant: 0,
  movementSpeed: 0,
  direction: 0,
  chaosRate: 0,
  maxHp: 1000,
  maxMp: 500,
  currHp: 1000,
  currMp: 500,
  str: 0,
  int: 0,
  dex: 0,
  con: 0,
  special: [0, 0, 0, 0],
  ...over,
});

const entity = (over: Partial<MonsterEntity> = {}): MonsterEntity => ({
  index: 1,
  name: 'Test',
  category: 'monster',
  position: { x: 0, y: 0 },
  score: score(),
  equipModelIds: [],
  lastSeenMs: 1_000,
  ...over,
});

const npc = (over: Partial<NpcEntity> = {}): NpcEntity => ({
  index: 2,
  name: 'Banker',
  category: 'npc',
  position: { x: 0, y: 0 },
  npcCategory: 'bank',
  equipModelIds: [],
  lastSeenMs: 1_000,
  ...over,
});

describe('isEntityFresh', () => {
  it('is fresh when lastSeen is at or after lastTeleport', () => {
    expect(isEntityFresh(entity({ lastSeenMs: 1_000 }), 1_000)).toBe(true);
    expect(isEntityFresh(entity({ lastSeenMs: 2_000 }), 1_000)).toBe(true);
  });

  it('is stale when lastSeen is before lastTeleport (post-teleport ghost)', () => {
    expect(isEntityFresh(entity({ lastSeenMs: 500 }), 1_000)).toBe(false);
  });

  it('treats missing lastSeen as 0 (stale after any teleport clock)', () => {
    expect(isEntityFresh(entity({ lastSeenMs: undefined }), 1)).toBe(false);
    expect(isEntityFresh(entity({ lastSeenMs: undefined }), 0)).toBe(true);
  });

  it('keeps idle entities fresh with no absolute age gate (D1 regression)', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60_000;
    expect(isEntityFresh(entity({ lastSeenMs: fiveMinutesAgo }), 0)).toBe(true);
    expect(isEntityFresh(entity({ lastSeenMs: fiveMinutesAgo }), fiveMinutesAgo - 1)).toBe(true);
  });
});

describe('isEntityPresent', () => {
  it('accepts far-but-fresh living entities (no horizon — NPC approach / party)', () => {
    expect(
      isEntityPresent(
        entity({ position: { x: 500, y: 500 }, lastSeenMs: 5_000, isDead: false }),
        0,
      ),
    ).toBe(true);
  });

  it('rejects dead and post-teleport residue', () => {
    expect(isEntityPresent(entity({ isDead: true, lastSeenMs: 5_000 }), 0)).toBe(false);
    expect(isEntityPresent(entity({ lastSeenMs: 100 }), 1_000)).toBe(false);
  });

  it('rejects leave-primed entities (deathState=0 — explicit server departure signal)', () => {
    expect(isEntityPresent(entity({ deathState: 0, lastSeenMs: 5_000 }), 0)).toBe(false);
  });

  it('rejects dying/fade entities (deathState=1/2) even if isDead was recycled', () => {
    expect(isEntityPresent(entity({ isDead: false, deathState: 1, lastSeenMs: 5_000 }), 0)).toBe(
      false,
    );
    expect(isEntityPresent(entity({ isDead: false, deathState: 2, lastSeenMs: 5_000 }), 0)).toBe(
      false,
    );
  });

  it('keeps a monster at 0 HP present when no death was signaled (HP is non-authoritative)', () => {
    // Monster currHp is driven by subtractive damage / hidden-HP syncs and can be
    // 0 while the mob is still alive. Only isDead (0x338) / deathState (0x165)
    // signal death — gating on currHp abandoned live targets after one hit.
    expect(isEntityPresent(entity({ score: score({ currHp: 0 }), lastSeenMs: 5_000 }), 0)).toBe(
      true,
    );
  });

  it('never hides a living monster (currHp has no bearing on liveness)', () => {
    expect(isEntityPresent(entity({ score: score({ currHp: 1 }), lastSeenMs: 5_000 }), 0)).toBe(
      true,
    );
  });

  it('does not apply the HP gate to NPCs (no MScore on the wire)', () => {
    expect(isEntityPresent(npc({ lastSeenMs: 5_000 }), 0)).toBe(true);
  });
});

describe('isEntityActionable', () => {
  const origin = { x: 100, y: 100 };

  it('rejects dead entities', () => {
    expect(
      isEntityActionable(entity({ isDead: true, position: origin, lastSeenMs: 5_000 }), {
        lastTeleportMs: 0,
        playerPos: origin,
        horizon: 6,
      }),
    ).toBe(false);
  });

  it('rejects post-teleport residue even when nearby', () => {
    expect(
      isEntityActionable(entity({ position: origin, lastSeenMs: 100 }), {
        lastTeleportMs: 1_000,
        playerPos: origin,
        horizon: 6,
      }),
    ).toBe(false);
  });

  it('rejects entities outside the attention horizon (walking ghosts)', () => {
    expect(
      isEntityActionable(entity({ position: { x: 200, y: 200 }, lastSeenMs: 5_000 }), {
        lastTeleportMs: 0,
        playerPos: origin,
        horizon: 6,
      }),
    ).toBe(false);
  });

  it('accepts nearby reconfirmed living entities', () => {
    expect(
      isEntityActionable(entity({ position: { x: 103, y: 102 }, lastSeenMs: 5_000 }), {
        lastTeleportMs: 0,
        playerPos: origin,
        horizon: 6,
      }),
    ).toBe(true);
  });

  it('uses default horizon when omitted', () => {
    // DEFAULT_DETECTION_RADIUS = 6
    expect(
      isEntityActionable(entity({ position: { x: 106, y: 100 }, lastSeenMs: 5_000 }), {
        lastTeleportMs: 0,
        playerPos: origin,
      }),
    ).toBe(true);
    expect(
      isEntityActionable(entity({ position: { x: 107, y: 100 }, lastSeenMs: 5_000 }), {
        lastTeleportMs: 0,
        playerPos: origin,
      }),
    ).toBe(false);
  });

  it('far present entities are not actionable under combat horizon', () => {
    expect(
      isEntityActionable(entity({ position: { x: 200, y: 200 }, lastSeenMs: 5_000 }), {
        lastTeleportMs: 0,
        playerPos: origin,
        horizon: 6,
      }),
    ).toBe(false);
    expect(isEntityPresent(entity({ position: { x: 200, y: 200 }, lastSeenMs: 5_000 }), 0)).toBe(
      true,
    );
  });
});
