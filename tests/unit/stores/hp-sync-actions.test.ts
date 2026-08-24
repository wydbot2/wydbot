/**
 * Unit tests for the absolute HP/MP store actions:
 *  - `useGameStore.setEntityHp`     (remote 0x336 / 0x181) — clamp only
 *  - `usePlayerStore.applyHpMpSync` (local 0x181 / 0x18A)  — clamp to current max
 *
 * nothing else — the canonical revive channel is `0x36A sub==2` (`+0x221 = 0`),
 * and respawn arrives as a `0x364` slot reuse resolved by the wire MScore.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../../src/renderer/stores/game-store';
import { usePlayerStore } from '../../../src/renderer/stores/player-store';
import type { MonsterEntity, NpcEntity } from '../../../src/shared/types/game-types';
import type { MScore } from '../../../src/shared/types/game-structures';

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

const entityAt = (index: number) => useGameStore.getState().entities.find((e) => e.index === index);

describe('useGameStore.setEntityHp', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('sets absolute HP and clamps to maxHp', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().setEntityHp(1, 1500);
    expect((entityAt(1) as MonsterEntity).score.currHp).toBe(1000);
    useGameStore.getState().setEntityHp(1, 300);
    expect((entityAt(1) as MonsterEntity).score.currHp).toBe(300);
  });

  it('ignores NPCs (no score)', () => {
    const npc: NpcEntity = {
      category: 'npc',
      index: 2,
      name: 'Banker',
      position: { x: 0, y: 0 },
      npcCategory: 'bank',
      equipModelIds: [],
    };
    useGameStore.getState().addEntity(npc);
    useGameStore.getState().setEntityHp(2, 0);
    expect(entityAt(2)).toMatchObject({ category: 'npc', npcCategory: 'bank' });
  });

  it('never revives — HP update keeps the death flag and machine armed', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().markEntityDead(1);
    expect(entityAt(1)?.isDead).toBe(true);
    useGameStore.getState().setEntityHp(1, 500);
    expect(entityAt(1)?.isDead).toBe(true);
    expect(entityAt(1)?.deathTickMs).not.toBeNull();
    expect((entityAt(1) as MonsterEntity).score.currHp).toBe(500);
  });

  it('does NOT revive a live entity', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().setEntityHp(1, 500);
    expect(entityAt(1)?.isDead).not.toBe(true);
  });

  it('does NOT revive when HP is 0 (stays dead)', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().markEntityDead(1);
    useGameStore.getState().setEntityHp(1, 0);
    expect(entityAt(1)?.isDead).toBe(true);
    expect((entityAt(1) as MonsterEntity).score.currHp).toBe(0);
  });

  it('leaves currMp untouched when omitted, clamps it when given', () => {
    useGameStore.getState().addEntity(monster({ score: score({ currMp: 500 }) }));
    useGameStore.getState().setEntityHp(1, 800);
    expect((entityAt(1) as MonsterEntity).score.currMp).toBe(500);
    useGameStore.getState().setEntityHp(1, 800, 9999);
    expect((entityAt(1) as MonsterEntity).score.currMp).toBe(500); // clamped to maxMp
    useGameStore.getState().setEntityHp(1, 800, 120);
    expect((entityAt(1) as MonsterEntity).score.currMp).toBe(120);
  });

  it('stamps lastSeenMs', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.setState((s) => ({
      entities: s.entities.map((e) => (e.index === 1 ? { ...e, lastSeenMs: 1 } : e)),
    }));
    useGameStore.getState().setEntityHp(1, 500);
    expect(entityAt(1)?.lastSeenMs).toBeGreaterThan(1);
  });

  it('re-stamps lastSeenMs on NPC without mutating it', () => {
    const npc: NpcEntity = {
      category: 'npc',
      index: 42,
      name: 'Banker',
      position: { x: 1, y: 1 },
      equipModelIds: [],
      npcCategory: 'bank',
    };
    useGameStore.getState().addEntity(npc);
    useGameStore.setState((s) => ({
      entities: s.entities.map((e) => (e.index === 42 ? { ...e, lastSeenMs: 1 } : e)),
    }));
    useGameStore.getState().setEntityHp(42, 999);
    const after = entityAt(42) as NpcEntity;
    expect(after.lastSeenMs).toBeGreaterThan(1);
    expect(after).toMatchObject({ category: 'npc', npcCategory: 'bank' });
  });
});

describe('useGameStore.updateEntityHp NPC presence', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('re-stamps lastSeenMs on NPC without mutating it', () => {
    const npc: NpcEntity = {
      category: 'npc',
      index: 7,
      name: 'Shop',
      position: { x: 2, y: 2 },
      equipModelIds: [],
      npcCategory: 'shop',
    };
    useGameStore.getState().addEntity(npc);
    useGameStore.setState((s) => ({
      entities: s.entities.map((e) => (e.index === 7 ? { ...e, lastSeenMs: 1 } : e)),
    }));
    useGameStore.getState().updateEntityHp(7, -50);
    const after = entityAt(7) as NpcEntity;
    expect(after.lastSeenMs).toBeGreaterThan(1);
    expect(after).toMatchObject({ category: 'npc', npcCategory: 'shop' });
  });
});

describe('useGameStore.markEntitySeen / removeEntity presence', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('markEntitySeen only touches lastSeenMs', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.setState((s) => ({
      entities: s.entities.map((e) => (e.index === 1 ? { ...e, lastSeenMs: 1, isDead: false } : e)),
    }));
    useGameStore.getState().markEntitySeen(1);
    expect(entityAt(1)?.lastSeenMs).toBeGreaterThan(1);
    expect(entityAt(1)?.isDead).toBe(false);
  });

  it('removeEntity is a no-op when index is missing (0x16f best-effort)', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().removeEntity(999);
    expect(entityAt(1)).toBeDefined();
  });
});

describe('usePlayerStore.applyHpMpSync', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
    usePlayerStore.setState({ maxHp: 1000, maxMp: 500, currentHp: 1000, currentMp: 500 });
  });

  it('sets absolute HP clamped to maxHp', () => {
    usePlayerStore.getState().applyHpMpSync({ currentHp: 1500 });
    expect(usePlayerStore.getState().currentHp).toBe(1000);
    usePlayerStore.getState().applyHpMpSync({ currentHp: 250 });
    expect(usePlayerStore.getState().currentHp).toBe(250);
  });

  it('leaves currentMp untouched when omitted', () => {
    usePlayerStore.getState().applyHpMpSync({ currentHp: 250 });
    expect(usePlayerStore.getState().currentMp).toBe(500);
  });

  it('sets and clamps currentMp when given', () => {
    usePlayerStore.getState().applyHpMpSync({ currentHp: 250, currentMp: 9999 });
    expect(usePlayerStore.getState().currentMp).toBe(500);
    usePlayerStore.getState().applyHpMpSync({ currentHp: 250, currentMp: 120 });
    expect(usePlayerStore.getState().currentMp).toBe(120);
  });
});
