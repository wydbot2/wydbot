import type { Entity, MPosition } from '@shared/types';
import { interpolateLeg, moveStepCount, perTileMs } from '@shared/lib/movement-math';

/**
 * Live position of a remote entity, dead-reckoned from its in-flight move leg
 * (`interpolateLeg` at `perTileMs(speedMove)` pace; clamps to `dst` once the
 * leg's travel time has elapsed, so completed legs need no sweeping).
 *
 * Consumers deciding on an entity's position (attack approach, range/LoS
 * gates, horizon filters, script views, minimap) MUST read this, not
 * `entity.position` (the last server-confirmed anchor).
 */
export const getEntityLivePosition = (entity: Entity, now: number = Date.now()): MPosition => {
  const leg = entity.moveLeg;
  if (!leg) return entity.position;
  const steps = moveStepCount(leg.src, leg.dst, leg.codes);
  return interpolateLeg(
    leg.src,
    leg.dst,
    steps,
    perTileMs(leg.speedMove),
    now - leg.startMs,
    leg.codes.length > 0 ? leg.codes : undefined,
  );
};
