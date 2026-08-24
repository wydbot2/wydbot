import type { Entity, MPosition } from '@shared/types';
import { chebyshev } from '@shared/lib/movement-math';
import { DEFAULT_DETECTION_RADIUS } from '@shared/constants/attack';
import { getEntityLivePosition } from './entity-position';

/**
 * Human-action / discovery gates for entities.
 *
 * Canonical never age-culls living slots; humans simply don't *act* on what is
 * off-screen or residue from another area. We approximate that with:
 *   1. teleport reconfirm — lastSeen ≥ lastTeleport
 *   2. horizon — Chebyshev ≤ player "attention" radius (camera stand-in)
 *
 * Store may still hold ghosts (faithful). Combat / script attention uses
 * `isEntityActionable`; long-range discovery (NPC approach, party) uses
 * `isEntityPresent` (no horizon — walk closes the gap). Minimap uses
 * teleport-fresh only.
 */

/** Default attention radius (tiles) when callers don't pass a horizon. */
export const ACTION_HORIZON_DEFAULT = DEFAULT_DETECTION_RADIUS;

/** Reconfirmed since the last area change (teleport / CharToWorld). */
export const isEntityFresh = (entity: Entity, lastTeleportMs: number): boolean =>
  (entity.lastSeenMs ?? 0) >= lastTeleportMs;

/**
 * Living + teleport-reconfirmed. No distance gate — callers that will walk to
 * the target (NPC approach, party invite) must not hide far-but-fresh entities.
 */
export const isEntityPresent = (entity: Entity, lastTeleportMs: number): boolean => {
  if (entity.isDead === true) return false;
  // Leave-prime / dying / fade — explicit server departure or death-in-progress.
  if (entity.deathState != null) return false;
  // HP is NOT a death signal. Monster currHp is driven by subtractive observed
  // damage (SingleAttackInbound) and hidden-HP syncs (0x336) — it is
  // non-authoritative and legitimately hits 0 while a mob is still alive, long
  // before the server signals death (0x338/0x165). Gating liveness on currHp<=0
  // abandoned live targets after one hit. Death is isDead / deathState only.
  return isEntityFresh(entity, lastTeleportMs);
};

export type ActionableContext = {
  lastTeleportMs: number;
  playerPos: MPosition;
  /** Chebyshev tiles; defaults to {@link ACTION_HORIZON_DEFAULT}. */
  horizon?: number;
};

/**
 * Whether the macro may target / list / interact with this entity *now*
 * (human-action gate with attention horizon). Not a store cull.
 */
export const isEntityActionable = (entity: Entity, ctx: ActionableContext): boolean => {
  if (!isEntityPresent(entity, ctx.lastTeleportMs)) return false;
  const horizon = ctx.horizon ?? ACTION_HORIZON_DEFAULT;
  return chebyshev(ctx.playerPos, getEntityLivePosition(entity)) <= horizon;
};
