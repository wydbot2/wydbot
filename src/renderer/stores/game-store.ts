import { create } from 'zustand';
import type { BaseEntity, Entity, EntityMoveLeg, MPosition } from '@shared/types';
import { logEntityLife } from '../lib/entity-life-log';
import { applyWireDeathState, resolveCreateDeathFields } from '../lib/entity-death';

interface GameState {
  entities: Entity[];

  addEntity: (entity: Entity) => void;
  removeEntity: (index: number) => void;
  /** Hard-set the anchor tile and clear any in-flight leg (remote teleport). */
  updateEntityPosition: (index: number, position: MPosition) => void;
  /** `0x36C` walk broadcast: anchor at the leg origin and record the leg. */
  applyEntityMove: (index: number, leg: EntityMoveLeg) => void;
  updateEntityHp: (index: number, hpDelta: number) => void;
  setEntityHp: (index: number, currHp: number, currMp?: number) => void;
  markEntityDead: (index: number, deathTickMs?: number) => void;
  setEntityDeathState: (index: number, state: 1 | 2, tickMs?: number) => void;
  /**
   * Returns whether the entity was removed.
   */
  applyMobDeathState: (index: number, wireState: number) => boolean;
  /** `0x36A subType==2` — clears ONLY isDead (canonical +0x221=0). */
  clearEntityDeath: (index: number) => void;
  markEntitySeen: (index: number) => void;
  clearEntities: () => void;
}

/** Apply a derived `BaseEntity` patch to the entity at `index`, preserving its discriminator. */
const patchBaseFields = (
  entities: Entity[],
  index: number,
  derive: (e: Entity) => Partial<BaseEntity>,
): Entity[] => entities.map((e): Entity => (e.index === index ? { ...e, ...derive(e) } : e));

export const useGameStore = create<GameState>((set, get) => ({
  entities: [],

  addEntity: (entity) =>
    set((state) => {
      const now = Date.now();
      const seen = { ...entity, lastSeenMs: now };
      const i = state.entities.findIndex((e) => e.index === entity.index);
      if (i < 0) {
        const death = resolveCreateDeathFields(entity, undefined, now);
        logEntityLife(
          death.isDead === true ? 'warn' : 'info',
          `add new idx=${entity.index} "${entity.name}" cat=${entity.category}` +
            (death.isDead === true ? ' (born-dead: wire currHp<=0)' : ''),
        );
        return { entities: [...state.entities, { ...seen, ...death }] };
      }
      // Slot reuse — game evicts on name mismatch, upserts on match.
      const existing = state.entities[i];
      if (existing.name !== entity.name) {
        const death = resolveCreateDeathFields(entity, undefined, now);
        logEntityLife(
          'warn',
          `slot collision idx=${entity.index}: "${existing.name}" → "${entity.name}" (evict + create)` +
            (death.isDead === true ? ' (born-dead: wire currHp<=0)' : ''),
        );
        const filtered = state.entities.filter((e) => e.index !== entity.index);
        return { entities: [...filtered, { ...seen, ...death }] };
      }
      const death = resolveCreateDeathFields(entity, existing, now);
      logEntityLife(
        death.isDead === true ? 'warn' : 'info',
        `upsert idx=${entity.index} "${entity.name}" (same name, pos=${entity.position.x},${entity.position.y}` +
          (death.isDead === true ? ', still dead: wire currHp<=0)' : ')'),
      );
      const next = [...state.entities];
      next[i] = { ...seen, ...death, moveLeg: null };
      return { entities: next };
    }),

  removeEntity: (index) =>
    set((state) => {
      const e = state.entities.find((x) => x.index === index);
      logEntityLife(
        'info',
        e ? `remove idx=${index} "${e.name}"` : `remove idx=${index} (not found)`,
      );
      return { entities: state.entities.filter((x) => x.index !== index) };
    }),

  updateEntityPosition: (index, position) =>
    set((state) => ({
      entities: patchBaseFields(state.entities, index, () => ({
        position,
        moveLeg: null,
        lastSeenMs: Date.now(),
      })),
    })),

  applyEntityMove: (index, leg) =>
    set((state) => {
      const e = state.entities.find((x) => x.index === index);
      if (!e) {
        logEntityLife('warn', `move idx=${index} (not in store) — leg dropped`);
        return {};
      }
      return {
        entities: patchBaseFields(state.entities, index, () => ({
          position: leg.src,
          moveLeg: leg,
          lastSeenMs: Date.now(),
        })),
      };
    }),

  markEntityDead: (index, deathTickMs) =>
    set((state) => {
      const e = state.entities.find((x) => x.index === index);
      logEntityLife(
        'info',
        e ? `mark-dead idx=${index} "${e.name}"` : `mark-dead idx=${index} (not in store)`,
      );
      return {
        entities: state.entities.map((x): Entity => {
          if (x.index !== index) return x;
          const death = {
            isDead: true,
            deathState: x.deathState ?? 1,
            deathTickMs: x.deathTickMs ?? deathTickMs ?? Date.now(),
            moveLeg: null,
            lastSeenMs: Date.now(),
          } as const;
          return x.category === 'npc'
            ? { ...x, ...death }
            : { ...x, ...death, score: { ...x.score, currHp: 0 } };
        }),
      };
    }),

  // Canonical 0x165 dying/fade — overrides +0x234 to the wire state.
  setEntityDeathState: (index, state, tickMs) =>
    set((s) => {
      const e = s.entities.find((x) => x.index === index);
      logEntityLife(
        'info',
        e
          ? `death-state idx=${index} "${e.name}" → ${state}`
          : `death-state idx=${index} → ${state} (not in store)`,
      );
      return {
        entities: patchBaseFields(s.entities, index, (e) => ({
          isDead: true,
          deathState: state,
          deathTickMs: e.deathTickMs ?? tickMs ?? Date.now(),
          moveLeg: null,
          lastSeenMs: Date.now(),
        })),
      };
    }),

  applyMobDeathState: (index, wireState) => {
    const entity = get().entities.find((e) => e.index === index);
    const transition = applyWireDeathState(entity, wireState, Date.now());

    if (transition.action === 'evict') {
      logEntityLife(
        'info',
        entity
          ? `0x165 idx=${index} "${entity.name}" wire=${wireState} prev=${entity.deathState ?? 'null'} → evict`
          : `0x165 idx=${index} wire=${wireState} → evict (not in store)`,
      );
      get().removeEntity(index);
      return true;
    }

    if (transition.action === 'noop') return false;

    if (entity) {
      logEntityLife(
        'info',
        transition.patch.deathState === 0
          ? `0x165 idx=${index} "${entity.name}" wire=0 → prime (leave)`
          : `0x165 idx=${index} "${entity.name}" wire=${wireState} prev=${entity.deathState ?? 'null'} → deathState=${transition.patch.deathState}`,
      );
    }
    set((s) => ({
      entities: patchBaseFields(s.entities, index, () => transition.patch),
    }));
    return false;
  },

  clearEntityDeath: (index) =>
    set((state) => ({
      entities: patchBaseFields(state.entities, index, () => ({
        isDead: false,
        lastSeenMs: Date.now(),
      })),
    })),

  // Freshness-only stamp — backs the `0x36B` defensive landing (server says
  // "this entity resynced", we let the freshness guard accept the next
  // `0x364`/`0x36c` immediately). Touches no liveness/visual fields.
  markEntitySeen: (index) =>
    set((state) => ({
      entities: patchBaseFields(state.entities, index, () => ({
        lastSeenMs: Date.now(),
      })),
    })),

  updateEntityHp: (index, hpDelta) =>
    set((state) => ({
      entities: state.entities.map((e): Entity => {
        if (e.index !== index) return e;
        if (e.category === 'npc') {
          return { ...e, lastSeenMs: Date.now() };
        }
        const newHp = Math.max(0, Math.min(e.score.maxHp, e.score.currHp + hpDelta));
        return { ...e, lastSeenMs: Date.now(), score: { ...e.score, currHp: newHp } };
      }),
    })),

  // Absolute HP/MP sync + presence stamp. Canonical 0x336 never revives — the
  // revive channel is 0x36A sub==2; respawn arrives as a 0x364 slot reuse.
  setEntityHp: (index, currHp, currMp) =>
    set((state) => ({
      entities: state.entities.map((e): Entity => {
        if (e.index !== index) return e;
        if (e.category === 'npc') {
          return { ...e, lastSeenMs: Date.now() };
        }
        const hp = Math.max(0, Math.min(e.score.maxHp, currHp));
        const mp = currMp == null ? e.score.currMp : Math.max(0, Math.min(e.score.maxMp, currMp));
        return { ...e, lastSeenMs: Date.now(), score: { ...e.score, currHp: hp, currMp: mp } };
      }),
    })),

  clearEntities: () =>
    set((state) => {
      logEntityLife('warn', `clearEntities — wiped ${state.entities.length} entities`);
      return { entities: [] };
    }),
}));

if (typeof window !== 'undefined') {
  (window as unknown as { __entitiesSnapshot?: () => unknown }).__entitiesSnapshot = () => {
    const list = useGameStore.getState().entities;
    return {
      total: list.length,
      byCategory: list.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + 1;
        return acc;
      }, {}),
      dead: list.filter((e) => e.isDead === true).length,
      entries: list.map((e) => ({
        idx: e.index,
        name: e.name,
        category: e.category,
        pos: e.position,
        isDead: e.isDead === true,
        deathState: e.deathState ?? null,
      })),
    };
  };
}
