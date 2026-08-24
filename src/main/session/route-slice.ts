/** Pure route slicer (main): cuts the next wire chunk from a stored route at `cur`. */
import { MAX_STEP_DISTANCE } from '@shared/constants/movement';
import { chebyshev } from '@shared/lib/movement-math';
import type { DirectionCode, StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

/** Next ≤MAX_STEP_DISTANCE-code chunk from the route tile nearest `cur`; null once arrived. */
export const sliceRouteFrom = (
  route: StreamRoute,
  cur: MPosition,
): { dest: MPosition; codes: DirectionCode[] } | null => {
  const { tiles, codes } = route;
  if (codes.length === 0) return null;

  // Nearest route tile to `cur`; on ties prefer the forward tile so a chunk never re-walks back.
  let idx = 0;
  let best = Infinity;
  for (let i = 0; i < tiles.length; i++) {
    const d = chebyshev(cur, tiles[i]);
    if (d < best || (d === best && i > idx)) {
      best = d;
      idx = i;
    }
  }
  if (idx >= codes.length) return null; // cur is at/past the final tile

  // Clamp to the next greedy-reachable waypoint so the emitted dst stays line-of-walk clear.
  const hardCap = Math.min(idx + MAX_STEP_DISTANCE, tiles.length - 1);
  const nextWaypoint = route.waypoints?.find((w) => w > idx);
  const end = nextWaypoint !== undefined ? Math.min(nextWaypoint, hardCap) : hardCap;
  return { dest: tiles[end], codes: codes.slice(idx, end) };
};
