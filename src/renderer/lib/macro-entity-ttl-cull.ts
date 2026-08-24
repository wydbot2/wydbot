import { useGameStore } from '../stores/game-store';
import { registerAmbientModule } from './macro-engine';
import { logMacro } from './macro-log';

const POLL_MS = 5_000;

/** Fade window after death before a corpse entity is dropped from the store (canonical T+10s). */
const TTL_MS = 10_000;

/**
 * Passive corpse cleanup: drops dead entities past the fade window (consumes
 * `deathTickMs`) so the store doesn't accumulate corpses.
 * Living discovery uses `isEntityActionable` (teleport + horizon) — not this
 * module. Living free is server-driven (`0x165` re-notify / `0x16f` / ≥3).
 */
registerAmbientModule({
  name: 'entity-ttl-cull',
  pollIntervalMs: POLL_MS,
  lifecycle: 'always-on',

  tick: async (signal) => {
    if (signal.aborted) return;

    const now = Date.now();
    const store = useGameStore.getState();
    const stale = store.entities.filter(
      (e) => e.isDead === true && e.deathTickMs != null && now - e.deathTickMs > TTL_MS,
    );
    if (stale.length === 0) return;

    for (const e of stale) store.removeEntity(e.index);
    logMacro('info', `[ttl-cull] removidas ${stale.length} entidades mortas`);
  },

  reset: () => {
    // Stateless — nothing to clear.
  },
});
