import type { MPosition } from '@shared/types';
import { attackDistance, chebyshev } from '@shared/lib/movement-math';
import { ARRIVE_EPSILON, MAX_LEG_STEPS } from '@shared/constants/movement';
import { ATTACK_LOS_ACQUIRE_MAX_EXTRA } from '@shared/constants/attack';
import { BLOCKED_SENTINEL } from '@shared/ipc/walkability';
import { getWalkabilityService } from './walkability-service';

/** Every tile in the Chebyshev square [1..radius] around `center` (center excluded). */
const ringTilesAround = (center: MPosition, radius: number): MPosition[] => {
  const tiles: MPosition[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      tiles.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  return tiles;
};

/**
 * Pick a random walkable tile in the Chebyshev ring [1..radius] around `center`,
 * using `walkabilityService.canStep` (±8 height-aware). Null if none qualify.
 */
export const pickWalkableTileAround = (center: MPosition, radius: number): MPosition | null => {
  const svc = getWalkabilityService();
  const candidates = ringTilesAround(center, radius);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const candidate of candidates) {
    if (svc.canStep(center.x, center.y, candidate.x, candidate.y)) return candidate;
  }
  return null;
};

/** Random non-wall tile in `rect` that is route-reachable from `from`. */
export const pickReachableTileInRect = (
  rect: { x0: number; y0: number; x1: number; y1: number },
  from: MPosition,
): MPosition | null => {
  const svc = getWalkabilityService();
  const candidates: MPosition[] = [];
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (svc.getHeight(x, y) === BLOCKED_SENTINEL) continue;
      candidates.push({ x, y });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const candidate of candidates) {
    if (
      svc.reachableWithin(from.x, from.y, candidate.x, candidate.y, MAX_LEG_STEPS).status ===
      'complete'
    ) {
      return candidate;
    }
  }
  return null;
};

/**
 * Approach picker for NPC / attack: of the tiles step-adjacent to `center` (ring
 * [1..radius]), return the one nearest `from` that is actually route-reachable from
 * `from` (contour-aware, not just step-adjacent to the target — so it never hands
 * back a tile sealed inside a walled room). Falls back to the nearest reachable
 * frontier toward `center`, or null if `center` is wholly unreachable.
 */
export const pickReachableTileAround = (
  center: MPosition,
  radius: number,
  from: MPosition,
): MPosition | null => {
  const svc = getWalkabilityService();
  const ring = ringTilesAround(center, radius).filter((t) =>
    svc.canStep(center.x, center.y, t.x, t.y),
  );
  ring.sort((a, b) => chebyshev(from, a) - chebyshev(from, b) || Math.random() - 0.5);
  for (const candidate of ring) {
    const probe = svc.reachableWithin(from.x, from.y, candidate.x, candidate.y, MAX_LEG_STEPS);
    if (probe.status === 'complete') return candidate;
  }
  return svc.reachableWithin(from.x, from.y, center.x, center.y, MAX_LEG_STEPS).frontier;
};

// Nearest reachable in-range tile with a clear line to the target — so the bot stops at range, not glued.
// Excludes tiles within ARRIVE_EPSILON of `from`: the mover treats those as already-arrived (no packet),
// so picking one would freeze the approach one tile short of range.
// No in-range LoS tile → expanding LoS-acquisition rings (range+1..+ATTACK_LOS_ACQUIRE_MAX_EXTRA);
// arriving there re-opens the line so the next pick converges. Null only when wholly sealed (→ abandon).
export const pickAttackTileAround = (
  center: MPosition,
  range: number,
  from: MPosition,
): MPosition | null => {
  const svc = getWalkabilityService();
  const inRange = ringTilesAround(center, range)
    .filter((t) => attackDistance(t, center) <= range && chebyshev(from, t) > ARRIVE_EPSILON)
    .sort((a, b) => chebyshev(from, a) - chebyshev(from, b));

  for (const t of inRange) {
    if (svc.reachableWithin(from.x, from.y, t.x, t.y, MAX_LEG_STEPS).status !== 'complete')
      continue;
    if (svc.hasLineOfWalk(t.x, t.y, center.x, center.y)) return t;
  }

  // LoS acquisition: out-of-range rings, nearest reachable tile with a clear
  // line. Out of range ⇒ the engagement re-picks from the closer tile.
  for (let extra = 1; extra <= ATTACK_LOS_ACQUIRE_MAX_EXTRA; extra++) {
    const ring = ringTilesAround(center, range + extra)
      .filter(
        (t) => attackDistance(t, center) === range + extra && chebyshev(from, t) > ARRIVE_EPSILON,
      )
      .sort((a, b) => chebyshev(from, a) - chebyshev(from, b));
    for (const t of ring) {
      if (svc.reachableWithin(from.x, from.y, t.x, t.y, MAX_LEG_STEPS).status !== 'complete')
        continue;
      if (svc.hasLineOfWalk(t.x, t.y, center.x, center.y)) return t;
    }
  }

  return null;
};
