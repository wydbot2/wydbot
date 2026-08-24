import { describe, expect, it } from 'vitest';
import {
  applyWireDeathState,
  resolveCreateDeathFields,
} from '../../../../src/renderer/lib/entity-death';
import type { MonsterEntity, NpcEntity } from '../../../../src/shared/types/game-types';
import type { MScore } from '../../../../src/shared/types/game-structures';

const NOW = 1_000_000;

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

const monster = (over: Partial<MonsterEntity> = {}): MonsterEntity => ({
  category: 'monster',
  index: 1,
  name: 'Orc',
  position: { x: 10, y: 10 },
  score: score(),
  equipModelIds: [],
  ...over,
});

const npc = (): NpcEntity => ({
  category: 'npc',
  index: 2,
  name: 'Banker',
  position: { x: 0, y: 0 },
  npcCategory: 'bank',
  equipModelIds: [],
});

describe('applyWireDeathState — 0x165 truth table (game)', () => {
  describe('virgin slot (+0x234 == -1)', () => {
    it('wire 0 → prime (deathState=0) WITHOUT re-stamping lastSeenMs', () => {
      const t = applyWireDeathState(undefined, 0, NOW);
      expect(t).toEqual({ action: 'patch', patch: { deathState: 0 } });
    });

    it('wire 1 → dying (isDead, deathState=1, fade clock armed)', () => {
      const t = applyWireDeathState(undefined, 1, NOW);
      expect(t).toEqual({
        action: 'patch',
        patch: { isDead: true, deathState: 1, deathTickMs: NOW, moveLeg: null, lastSeenMs: NOW },
      });
    });

    it('wire 2 → fade (isDead, deathState=2, fade clock armed)', () => {
      const t = applyWireDeathState(undefined, 2, NOW);
      expect(t).toEqual({
        action: 'patch',
        patch: { isDead: true, deathState: 2, deathTickMs: NOW, moveLeg: null, lastSeenMs: NOW },
      });
    });

    it('wire ≥3 → evict', () => {
      expect(applyWireDeathState(undefined, 3, NOW)).toEqual({ action: 'evict' });
    });
  });

  describe('primed slot (deathState=0) — route B: any wire state evicts', () => {
    const primed = { deathState: 0 as const };
    it.each([0, 1, 2, 3, 99])('wire %i → evict', (wire) => {
      expect(applyWireDeathState(primed, wire, NOW)).toEqual({ action: 'evict' });
    });
  });

  describe('dying slot (deathState=1)', () => {
    const dying = { isDead: true, deathState: 1 as const, deathTickMs: 500 };

    it('wire 0 → no-op', () => {
      expect(applyWireDeathState(dying, 0, NOW)).toEqual({ action: 'noop' });
    });

    it('wire 1 → no-op (fade timer already armed)', () => {
      expect(applyWireDeathState(dying, 1, NOW)).toEqual({ action: 'noop' });
    });

    it('wire 2 → advances to fade, preserving deathTickMs', () => {
      const t = applyWireDeathState(dying, 2, NOW);
      expect(t).toEqual({ action: 'patch', patch: { deathState: 2, lastSeenMs: NOW } });
    });

    it('wire ≥3 → evict (route A is unconditional — regression test)', () => {
      expect(applyWireDeathState(dying, 3, NOW)).toEqual({ action: 'evict' });
    });
  });

  describe('fading slot (deathState=2) — route B: any wire state evicts', () => {
    const fading = { isDead: true, deathState: 2 as const, deathTickMs: 500 };
    it.each([0, 1, 2, 3])('wire %i → evict', (wire) => {
      expect(applyWireDeathState(fading, wire, NOW)).toEqual({ action: 'evict' });
    });
  });
});

describe('resolveCreateDeathFields — 0x364 create/upsert (game)', () => {
  it('NPC carries no MScore → alive', () => {
    expect(resolveCreateDeathFields(npc(), undefined, NOW)).toEqual({
      isDead: false,
      deathState: null,
      deathTickMs: null,
    });
  });

  it('wire currHp>0 proves life → alive (normal create / respawn)', () => {
    expect(
      resolveCreateDeathFields(monster({ score: score({ currHp: 700 }) }), undefined, NOW),
    ).toEqual({ isDead: false, deathState: null, deathTickMs: null });
  });

  it('wire currHp=0 with maxHp>0 proves a corpse → born-dead, fade clock armed', () => {
    expect(
      resolveCreateDeathFields(monster({ score: score({ currHp: 0 }) }), undefined, NOW),
    ).toEqual({ isDead: true, deathState: null, deathTickMs: NOW });
  });

  it('corpse re-announce preserves the existing fade clock (deathTickMs)', () => {
    const existing = { isDead: true, deathTickMs: 4242 };
    expect(
      resolveCreateDeathFields(monster({ score: score({ currHp: 0 }) }), existing, NOW),
    ).toEqual({ isDead: true, deathState: null, deathTickMs: 4242 });
  });

  it('respawn over a dead slot (wire currHp>0) revives — canonical B1 + sub==2 net effect', () => {
    const existing = { isDead: true, deathState: 1 as const, deathTickMs: 4242 };
    expect(
      resolveCreateDeathFields(monster({ score: score({ currHp: 1000 }) }), existing, NOW),
    ).toEqual({ isDead: false, deathState: null, deathTickMs: null });
  });

  it('uninformative wire (maxHp=0) falls back to alive (legacy behavior)', () => {
    expect(
      resolveCreateDeathFields(monster({ score: score({ currHp: 0, maxHp: 0 }) }), undefined, NOW),
    ).toEqual({ isDead: false, deathState: null, deathTickMs: null });
  });
});
