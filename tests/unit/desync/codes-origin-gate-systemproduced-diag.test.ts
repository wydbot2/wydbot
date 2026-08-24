/**
 * Diagnostic: can the real MovementState SoT produce an off-route `src`
 * that fires the origin-coherence gate during a normal route stream? Drives
 * the REAL MovementState and prints the predicted trajectory.
 *
 * Not a pass/fail spec — a probe of system reachability.
 */
import { describe, it, expect } from 'vitest';
import { MovementState } from '@main/session/movement-state';
import { sliceRouteFrom } from '@main/session/route-slice';
import { moveStepCount, perTileMs } from '@shared/lib/movement-math';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

const pos = (x: number, y: number): MPosition => ({ x, y });
const sumCodes = (dest: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = dest;
  for (const c of codes) {
    x -= DIR_DELTA[c].x;
    y -= DIR_DELTA[c].y;
  }
  return { x, y };
};
const buildRoute = (start: MPosition, codes: DirectionCode[]): StreamRoute => {
  const tiles: MPosition[] = [start];
  for (const c of codes) {
    const last = tiles[tiles.length - 1];
    tiles.push({ x: last.x + DIR_DELTA[c].x, y: last.y + DIR_DELTA[c].y });
  }
  return { tiles, codes, waypoints: [tiles.length - 1] };
};

describe('DIAG: within ONE committed leg, predicted is ALWAYS an on-route tile (gate cannot fire)', () => {
  it('predicted src reconstructs to itself at every elapsed offset along the committed codes', () => {
    const ms = new MovementState();
    ms.setCharToWorld(pos(100, 100));
    const speed = 4;
    const route = buildRoute(pos(100, 100), Array(12).fill(DIR.E));
    ms.setRoute('walker', route.tiles, route.codes, route.waypoints);

    // Commit the first chunk exactly as command-sender.movement would.
    const t0 = 1_000_000;
    const src0 = ms.getPredictedPosition(t0);
    const slice0 = sliceRouteFrom(route, src0)!;
    ms.commitMove(slice0.dest, moveStepCount(src0, slice0.dest, slice0.codes), speed, slice0.codes);

    // Sample the predicted across the whole leg; at each sample, re-slice the
    // SAME route and assert the gate would pass (codes-origin === predicted).
    const ptms = perTileMs(speed);
    let offRouteSamples = 0;
    for (let dt = 0; dt <= slice0.codes.length * ptms + 200; dt += 37) {
      const p = ms.getPredictedPosition(t0 + dt);
      const onRoute = route.tiles.some((tl) => tl.x === p.x && tl.y === p.y);
      if (!onRoute) offRouteSamples++;
      const sl = sliceRouteFrom(route, p);
      if (sl) {
        const origin = sumCodes(sl.dest, sl.codes);
        // The gate passes for every system-produced predicted on the SAME route.
        expect(origin).toEqual(p);
      }
    }
    // The predicted NEVER leaves the route it was sliced from.
    expect(offRouteSamples).toBe(0);
  });
});
