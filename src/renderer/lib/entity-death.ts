import type { Entity } from '@shared/types';

/** Death-machine fields owned on `BaseEntity` (mirror of canonical `+0x221`/`+0x234`/`+0x8fc`). */
export interface DeathFields {
  isDead?: boolean;
  deathState?: 0 | 1 | 2 | null;
  deathTickMs?: number | null;
}

export type DeathTransition =
  | { action: 'patch'; patch: DeathFields & { lastSeenMs?: number; moveLeg?: null } }
  | { action: 'evict' }
  | { action: 'noop' };

/**
 * unconditionally; route B (prior ∈ {0, 2}) evicts on any re-notify. The prime
 * patch does NOT re-stamp lastSeenMs — a leave notice is departure, not presence.
 */
export const applyWireDeathState = (
  entity: DeathFields | undefined,
  wireState: number,
  now: number,
): DeathTransition => {
  const prev = entity?.deathState ?? null;

  if (wireState >= 3) return { action: 'evict' };
  if (prev === 0 || prev === 2) return { action: 'evict' };

  if (prev == null) {
    if (wireState === 0) {
      return { action: 'patch', patch: { deathState: 0 } };
    }
    if (wireState === 1) {
      return {
        action: 'patch',
        patch: { isDead: true, deathState: 1, deathTickMs: now, moveLeg: null, lastSeenMs: now },
      };
    }
    return {
      action: 'patch',
      patch: { isDead: true, deathState: 2, deathTickMs: now, moveLeg: null, lastSeenMs: now },
    };
  }

  // prev === 1 (dying): only wire 2 advances to fade.
  if (wireState === 2) {
    return { action: 'patch', patch: { deathState: 2, lastSeenMs: now } };
  }
  return { action: 'noop' };
};

export interface CreateDeathResolution {
  isDead?: boolean;
  deathState: null;
  deathTickMs: number | null;
}

/**
 * resets the machine; canonical B1 never clears +0x221, so life is resolved from
 * the wire MScore: currHp>0 proves life, maxHp>0 && currHp<=0 proves a corpse.
 */
export const resolveCreateDeathFields = (
  entity: Entity,
  existing: DeathFields | undefined,
  now: number,
): CreateDeathResolution => {
  if (entity.category === 'npc') {
    return { isDead: false, deathState: null, deathTickMs: null };
  }
  const { currHp, maxHp } = entity.score;
  if (maxHp > 0 && currHp <= 0) {
    return { isDead: true, deathState: null, deathTickMs: existing?.deathTickMs ?? now };
  }
  return { isDead: false, deathState: null, deathTickMs: null };
};
