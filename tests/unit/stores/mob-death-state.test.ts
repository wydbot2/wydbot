import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../../src/renderer/stores/game-store';
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

const at = (index: number) => useGameStore.getState().entities.find((e) => e.index === index);

describe('applyMobDeathState (0x165) — game', () => {
  beforeEach(() => useGameStore.getState().clearEntities());

  // -- Virgin slot (+0x234 == -1): first 0x165 --

  describe('first touch (virgin slot)', () => {
    it('state=0 primes (deathState=0), keeps entity in store', () => {
      useGameStore.getState().addEntity(monster());
      const removed = useGameStore.getState().applyMobDeathState(10, 0);
      expect(removed).toBe(false);
      const e = at(10);
      expect(e).toBeDefined();
      expect(e?.isDead).toBeFalsy();
      expect(e?.deathState).toBe(0);
    });

    it('state=1 marks dying', () => {
      useGameStore.getState().addEntity(monster());
      expect(useGameStore.getState().applyMobDeathState(10, 1)).toBe(false);
      expect(at(10)?.isDead).toBe(true);
      expect(at(10)?.deathState).toBe(1);
    });

    it('state=2 marks fade', () => {
      useGameStore.getState().addEntity(monster());
      expect(useGameStore.getState().applyMobDeathState(10, 2)).toBe(false);
      expect(at(10)?.isDead).toBe(true);
      expect(at(10)?.deathState).toBe(2);
    });

    it('state≥3 hard-evicts immediately', () => {
      useGameStore.getState().addEntity(monster());
      expect(useGameStore.getState().applyMobDeathState(10, 3)).toBe(true);
      expect(at(10)).toBeUndefined();
    });
  });

  // -- Primed (+0x234 == 0): second 0x165 → evict --

  describe('second touch on primed slot (deathState=0)', () => {
    it('state=0 evicts after prime (game-notify)', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().applyMobDeathState(10, 0); // prime
      const removed = useGameStore.getState().applyMobDeathState(10, 0); // re-notify
      expect(removed).toBe(true);
      expect(at(10)).toBeUndefined();
    });

    it('state=1 evicts on primed slot', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().applyMobDeathState(10, 0); // prime
      expect(useGameStore.getState().applyMobDeathState(10, 1)).toBe(true);
      expect(at(10)).toBeUndefined();
    });

    it('state=2 evicts on primed slot', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().applyMobDeathState(10, 0); // prime
      expect(useGameStore.getState().applyMobDeathState(10, 2)).toBe(true);
      expect(at(10)).toBeUndefined();
    });

    it('state=3 evicts on primed slot (hard evict still works)', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().applyMobDeathState(10, 0); // prime
      expect(useGameStore.getState().applyMobDeathState(10, 3)).toBe(true);
      expect(at(10)).toBeUndefined();
    });
  });

  // -- Fading (+0x234 == 2): second 0x165 → evict --

  describe('second touch on fading slot (deathState=2)', () => {
    it('state=0 evicts fading entity', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().applyMobDeathState(10, 2); // fade
      expect(useGameStore.getState().applyMobDeathState(10, 0)).toBe(true);
      expect(at(10)).toBeUndefined();
    });

    it('state=1 evicts fading entity', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().applyMobDeathState(10, 2); // fade
      expect(useGameStore.getState().applyMobDeathState(10, 1)).toBe(true);
      expect(at(10)).toBeUndefined();
    });
  });

  // -- Dying (+0x234 == 1): no-op / fade-advance / hard evict --

  describe('second touch on dying slot (deathState=1)', () => {
    it('no-ops when fade timer is active (deathTickMs set)', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().setEntityDeathState(10, 1, Date.now());
      const eBefore = at(10);
      const removed = useGameStore.getState().applyMobDeathState(10, 1);
      expect(removed).toBe(false);
      // Entity unchanged — timer still running.
      expect(at(10)).toBe(eBefore);
    });

    it('wire=1 on dying is a no-op even without an armed timer', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.setState((s) => ({
        entities: s.entities.map((e) =>
          e.index === 10 ? { ...e, isDead: true, deathState: 1 as const, deathTickMs: null } : e,
        ),
      }));
      expect(useGameStore.getState().applyMobDeathState(10, 1)).toBe(false);
      expect(at(10)?.deathState).toBe(1);
      expect(at(10)?.deathTickMs).toBeNull();
    });

    it('wire=2 on dying advances to fade, preserving the fade clock', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().applyMobDeathState(10, 1);
      const tick = at(10)?.deathTickMs;
      expect(useGameStore.getState().applyMobDeathState(10, 2)).toBe(false);
      expect(at(10)?.deathState).toBe(2);
      expect(at(10)?.deathTickMs).toBe(tick);
    });
  });

  // -- Hard evict (wire ≥3): always removes --

  describe('hard evict (wireState >= 3)', () => {
    it('state=3 evicts virgin slot', () => {
      useGameStore.getState().addEntity(monster());
      expect(useGameStore.getState().applyMobDeathState(10, 3)).toBe(true);
      expect(at(10)).toBeUndefined();
    });

    it('state=3 evicts primed slot', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().applyMobDeathState(10, 0);
      expect(useGameStore.getState().applyMobDeathState(10, 3)).toBe(true);
      expect(at(10)).toBeUndefined();
    });

    it('state=3 evicts dying slot (route A is unconditional)', () => {
      useGameStore.getState().addEntity(monster());
      useGameStore.getState().setEntityDeathState(10, 1, Date.now());
      expect(useGameStore.getState().applyMobDeathState(10, 3)).toBe(true);
      expect(at(10)).toBeUndefined();
    });

    it('state=99 evicts any slot', () => {
      useGameStore.getState().addEntity(monster());
      expect(useGameStore.getState().applyMobDeathState(10, 99)).toBe(true);
      expect(at(10)).toBeUndefined();
    });
  });
});
