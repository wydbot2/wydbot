/**
 * Death-writer fidelity tests for `useGameStore` — each writer touches exactly
 * the fields its canonical counterpart touches:
 *  - `setEntityHp`      (0x336/0x181) — HP only, never revives
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../../src/renderer/stores/game-store';
import type { MonsterEntity } from '../../../src/shared/types/game-types';
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
  index: 10,
  name: 'Orc',
  position: { x: 5, y: 5 },
  score: score(),
  equipModelIds: [],
  ...over,
});

const at = (index: number) =>
  useGameStore.getState().entities.find((e) => e.index === index) as MonsterEntity | undefined;

describe('addEntity — 0x364 death resolution', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('normal create (currHp>0) is alive with no death machine', () => {
    useGameStore.getState().addEntity(monster());
    const e = at(10);
    expect(e?.isDead).toBe(false);
    expect(e?.deathState).toBeNull();
    expect(e?.deathTickMs).toBeNull();
  });

  it('born-dead: create carrying currHp=0 seeds isDead + arms the fade clock', () => {
    useGameStore.getState().addEntity(monster({ score: score({ currHp: 0 }) }));
    const e = at(10);
    expect(e?.isDead).toBe(true);
    expect(e?.deathTickMs).not.toBeNull();
  });

  it('upsert respawn (same name, currHp>0) revives a dead slot', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().markEntityDead(10);
    expect(at(10)?.isDead).toBe(true);
    useGameStore.getState().addEntity(monster({ score: score({ currHp: 1000 }) }));
    const e = at(10);
    expect(e?.isDead).toBe(false);
    expect(e?.deathState).toBeNull();
    expect(e?.deathTickMs).toBeNull();
  });

  it('upsert corpse re-announce (same name, currHp=0) KEEPS death and the original fade clock', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().markEntityDead(10, 123_000);
    const tickBefore = at(10)?.deathTickMs;
    useGameStore.getState().addEntity(monster({ score: score({ currHp: 0 }) }));
    const e = at(10);
    expect(e?.isDead).toBe(true);
    expect(e?.deathTickMs).toBe(tickBefore);
    expect(e?.score.currHp).toBe(0);
  });

  it('slot collision (name change) evicts and re-seeds from the wire', () => {
    useGameStore.getState().addEntity(monster({ score: score({ currHp: 0 }) }));
    expect(at(10)?.isDead).toBe(true);
    useGameStore.getState().addEntity(monster({ name: 'Goblin' }));
    const e = at(10);
    expect(e?.name).toBe('Goblin');
    expect(e?.isDead).toBe(false);
  });
});

describe('markEntityDead — 0x338', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('zeroes currHp (canonical +0x740 = 0)', () => {
    useGameStore.getState().addEntity(monster({ score: score({ currHp: 800 }) }));
    useGameStore.getState().markEntityDead(10);
    expect(at(10)?.isDead).toBe(true);
    expect(at(10)?.score.currHp).toBe(0);
  });
});

describe('clearEntityDeath — 0x36A sub==2', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('clears ONLY isDead — the death machine stays armed (canonical: no +0x234/+0x8fc write)', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().applyMobDeathState(10, 1);
    const tick = at(10)?.deathTickMs;
    useGameStore.getState().clearEntityDeath(10);
    const e = at(10);
    expect(e?.isDead).toBe(false);
    expect(e?.deathState).toBe(1);
    expect(e?.deathTickMs).toBe(tick);
  });
});

describe('setEntityHp — 0x336/0x181 remote', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('never revives — updates HP but keeps the death flag and machine', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().markEntityDead(10);
    useGameStore.getState().setEntityHp(10, 500);
    const e = at(10);
    expect(e?.isDead).toBe(true);
    expect(e?.deathTickMs).not.toBeNull();
    expect(e?.score.currHp).toBe(500);
  });
});
