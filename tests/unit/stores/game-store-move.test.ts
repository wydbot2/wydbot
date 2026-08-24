import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../../src/renderer/stores/game-store';
import { DIR } from '../../../src/shared/ipc/walkability';
import type { EntityMoveLeg } from '../../../src/shared/types/game-types';
import type { MonsterEntity } from '../../../src/shared/types/game-types';
import type { MScore } from '../../../src/shared/types/game-structures';

const score = (): MScore => ({
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
});

const monster = (index = 10): MonsterEntity => ({
  category: 'monster',
  index,
  name: 'Orc',
  position: { x: 5, y: 5 },
  score: score(),
  equipModelIds: [],
});

const leg = (over: Partial<EntityMoveLeg> = {}): EntityMoveLeg => ({
  src: { x: 5, y: 5 },
  dst: { x: 8, y: 5 },
  codes: [DIR.E, DIR.E, DIR.E],
  speedMove: 4,
  startMs: Date.now(),
  ...over,
});

const at = (index: number) => useGameStore.getState().entities.find((e) => e.index === index);

describe('applyEntityMove — 0x36C remote walk broadcast', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('anchors the entity at the server-confirmed leg origin and records the leg', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().applyEntityMove(10, leg());
    const e = at(10);
    expect(e?.position).toEqual({ x: 5, y: 5 });
    expect(e?.moveLeg?.dst).toEqual({ x: 8, y: 5 });
  });

  it('replaces an in-flight leg (server chain re-anchors forward)', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().applyEntityMove(10, leg());
    useGameStore
      .getState()
      .applyEntityMove(
        10,
        leg({ src: { x: 8, y: 5 }, dst: { x: 8, y: 8 }, codes: [DIR.N, DIR.N, DIR.N] }),
      );
    const e = at(10);
    expect(e?.position).toEqual({ x: 8, y: 5 });
    expect(e?.moveLeg?.dst).toEqual({ x: 8, y: 8 });
  });

  it('is a no-op for an unknown index (move before create)', () => {
    useGameStore.getState().applyEntityMove(999, leg());
    expect(at(999)).toBeUndefined();
  });

  it('bumps lastSeenMs so the entity stays teleport-fresh', () => {
    useGameStore.getState().addEntity(monster());
    const before = Date.now();
    useGameStore.getState().applyEntityMove(10, leg());
    expect(at(10)?.lastSeenMs).toBeGreaterThanOrEqual(before);
  });
});

describe('moveLeg lifecycle — cleared on spawn / death / teleport', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  it('spawn upsert (0x364 same name) clears the leg — full authoritative state', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().applyEntityMove(10, leg());
    useGameStore.getState().addEntity(monster());
    expect(at(10)?.moveLeg).toBeNull();
  });

  it('markEntityDead (0x338) clears the leg', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().applyEntityMove(10, leg());
    useGameStore.getState().markEntityDead(10);
    expect(at(10)?.moveLeg).toBeNull();
  });

  it('0x165 dying state clears the leg', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().applyEntityMove(10, leg());
    useGameStore.getState().applyMobDeathState(10, 1);
    expect(at(10)?.moveLeg).toBeNull();
  });

  it('updateEntityPosition (remote teleport) clears the leg and snaps the anchor', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().applyEntityMove(10, leg());
    useGameStore.getState().updateEntityPosition(10, { x: 50, y: 50 });
    const e = at(10);
    expect(e?.position).toEqual({ x: 50, y: 50 });
    expect(e?.moveLeg).toBeNull();
  });

  it('revive (clearEntityDeath) clears ONLY isDead — keeps the leg and the death machine', () => {
    useGameStore.getState().addEntity(monster());
    useGameStore.getState().applyEntityMove(10, leg());
    useGameStore.getState().markEntityDead(10);
    useGameStore.getState().applyEntityMove(10, leg());
    useGameStore.getState().clearEntityDeath(10);
    // Canonical sub==2 writes +0x221=0 and nothing else: the death machine
    // (deathState/deathTickMs) stays armed and a fresh server leg stays valid.
    expect(at(10)?.isDead).toBe(false);
    expect(at(10)?.moveLeg).not.toBeNull();
    expect(at(10)?.deathState).not.toBeNull();
  });
});
