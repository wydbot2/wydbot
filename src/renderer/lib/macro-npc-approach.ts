import { chebyshev } from '@shared/lib/movement-math';
import type { NpcEntity, MPosition } from '@shared/types';
import { abortableDelay } from './macro-timing';
import { awaitMove } from './macro-move-request';
import { MoveRejectedError } from './move-echo-bus';
import { getEntityLivePosition } from './entity-position';
import { pickReachableTileAround } from './walkability-pickers';
import { findNpcsByName } from './entity-selectors';
import { usePlayerStore } from '../stores/player-store';

/**
 * Shared NPC-approach toolkit — the click-free "walk to an NPC" core used by
 * both `executeInteract` (before it clicks) and `executeFollow` (which just
 * stops). Kept in its own module, free of `macro-engine` coupling, so the two
 * handlers reuse one approach implementation (mirrors `macro-attack-engagement`).
 */

/** Max Chebyshev distance (tiles) to NPC before interaction; ≥ the mover's ARRIVE_EPSILON so the last approach tile counts as in range. */
export const NPC_INTERACT_RANGE = 2;

/**
 * Safety guard on the approach loop. ~30 walk attempts covers any reachable
 * NPC on the map; if we haven't arrived by then, the player is blocked or
 * the target keeps moving — bail out.
 */
export const MAX_LOOP_ITERATIONS = 30;

export const APPROACH_RADIUS_DEFAULT = 1;

/** Above observed AOI re-send lag (~36 s) after teleport for distant NPCs. */
const FRESH_WAIT_TIMEOUT_MS = 40_000;
const FRESH_POLL_MS = 250;

/** Poll until a fresh (server-reconfirmed since teleport) NPC named `npcName` exists; false on timeout. */
export const waitForFreshNpc = async (npcName: string, signal: AbortSignal): Promise<boolean> => {
  const deadline = Date.now() + FRESH_WAIT_TIMEOUT_MS;
  while (!signal.aborted) {
    if (findNpcsByName(npcName).length > 0) return true;
    if (Date.now() >= deadline) return false;
    await abortableDelay(FRESH_POLL_MS, signal);
  }
  return false;
};

/** Resolve an NPC by name to its live entity, disambiguating homonyms by closest-to-player Chebyshev. */
export const resolveClosestNpc = (npcName: string, myPos: MPosition): NpcEntity | null => {
  const candidates = findNpcsByName(npcName);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return candidates.reduce((best, n) =>
    chebyshev(getEntityLivePosition(n), myPos) < chebyshev(getEntityLivePosition(best), myPos)
      ? n
      : best,
  );
};

export type ApproachOutcome =
  | { status: 'arrived'; npc: NpcEntity }
  | { status: 'not-fresh' }
  | { status: 'gone' }
  | { status: 'stuck' }
  | { status: 'aborted' };

/**
 * Walk the player within `NPC_INTERACT_RANGE` of the named NPC (closest-to-player
 * tiebreak) and stop — the click-free approach shared by `executeInteract` and
 * `executeFollow`. Re-resolves the NPC each iteration, so it chases a roaming
 * target during the approach. Does not interact and has no capability gate.
 */
export const approachNpc = async (
  npcName: string,
  signal: AbortSignal,
): Promise<ApproachOutcome> => {
  const ready = await waitForFreshNpc(npcName, signal);
  if (signal.aborted) return { status: 'aborted' };
  if (!ready) return { status: 'not-fresh' };

  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    if (signal.aborted) return { status: 'aborted' };

    const myPos = usePlayerStore.getState().position;
    const liveNpc = resolveClosestNpc(npcName, myPos);
    if (!liveNpc) return { status: 'gone' };

    const npcPos = getEntityLivePosition(liveNpc);
    if (chebyshev(myPos, npcPos) <= NPC_INTERACT_RANGE) {
      return { status: 'arrived', npc: liveNpc };
    }

    const approach = pickReachableTileAround(npcPos, APPROACH_RADIUS_DEFAULT, myPos);
    if (!approach) return { status: 'stuck' };

    try {
      await awaitMove(approach, signal);
    } catch (err) {
      // No route to this ring tile — try a different one next iteration.
      if (err instanceof MoveRejectedError && err.payload.reason === 'unreachable') continue;
      throw err;
    }
  }
  return { status: 'stuck' };
};
