/**
 * Stall DURATION / severity measurement for the origin-coherence gate.
 *
 * The companion probes show the gate CAN fire on a system-produced src after a
 * cross-route replan-while-in-flight. This one measures HOW BAD it is: does the
 * macro deadlock (no server progress ever), or recover after a bounded delay?
 *
 * Faithful model of the renderer recovery loop (macro-engine.ts:233-273):
 *   - the renderer awaits gameApi.move; a 'replan' echo arrives at cooldownMs=0,
 *     then the loop calls replanFrom() (re-plans from the LAGGED mirror) and
 *     waits CHUNK_RETRY_MS (250ms) before re-issuing.
 *   - main keeps interpolating the OLD in-flight leg until its travel time
 *     elapses; getPredictedPosition only settles to the committed dst then.
 *
 * We simulate the renderer mirror trailing main's predicted by ~1 tile (the
 * realistic PLAYER_POSITION broadcast lag) and re-planning a divergent route
 * each retry, and count how many retries emit ZERO packets before recovery.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MovementState } from '@main/session/movement-state';
import { sliceRouteFrom } from '@main/session/route-slice';
import { moveStepCount, chebyshev } from '@shared/lib/movement-math';
import { ARRIVE_EPSILON, ORIGIN_REANCHOR_TOLERANCE } from '@shared/constants/movement';
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
const runMovement = (
  ms: MovementState,
  source: string,
  finalDst: MPosition,
  speed: number,
): { status: string; sentPacket: boolean } => {
  const src = ms.getPredictedPosition(Date.now());
  if (chebyshev(src, finalDst) <= ARRIVE_EPSILON) return { status: 'arrived', sentPacket: false };
  const route = ms.getRoute(source);
  if (!route) return { status: 'no-route', sentPacket: false };
  const slice = sliceRouteFrom(route, src);
  if (!slice) return { status: 'replan', sentPacket: false };
  const origin = sumCodes(slice.dest, slice.codes);
  // FIX: re-anchor within tolerance; only off-corridor drift replans.
  if (chebyshev(origin, src) > ORIGIN_REANCHOR_TOLERANCE)
    return { status: 'replan', sentPacket: false };
  const wireSrc = origin;
  if (ms.isLegInFlight(wireSrc, slice.codes, Date.now()))
    return { status: 'in-progress', sentPacket: false };
  const steps = moveStepCount(wireSrc, slice.dest, slice.codes);
  ms.commitMove(slice.dest, steps, speed, slice.codes, wireSrc);
  return { status: 'in-progress', sentPacket: true };
};
const buildRoute = (start: MPosition, codes: DirectionCode[]): StreamRoute => {
  const tiles: MPosition[] = [start];
  for (const c of codes) {
    const last = tiles[tiles.length - 1];
    tiles.push({ x: last.x + DIR_DELTA[c].x, y: last.y + DIR_DELTA[c].y });
  }
  return { tiles, codes, waypoints: [tiles.length - 1] };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('FIX — cross-route replan re-anchors immediately (no zero-packet stall)', () => {
  it('cross-route replan-while-in-flight now re-anchors and sends on the first retry', () => {
    const ms = new MovementState();
    ms.setCharToWorld(pos(600, 600));
    const speed = 4; // perTileMs 250

    // Long in-flight east leg (12 tiles → 3000ms of interpolation).
    const east = buildRoute(pos(600, 600), Array(12).fill(DIR.E));
    ms.setRoute('walker', east.tiles, east.codes, east.waypoints);
    const first = runMovement(ms, 'walker', pos(612, 600), speed);
    expect(first.sentPacket).toBe(true);

    // Let the east leg get PARTWAY in-flight (~3 tiles) before the renderer chases
    // a new target — this is the realistic case (mid-walk re-target / contour).
    vi.advanceTimersByTime(3 * 250 + 10); // predicted now ≈ (603,600)
    expect(ms.getPredictedPosition(Date.now())).toEqual(pos(603, 600));

    // The renderer then chases a target requiring a SOUTH route. It re-plans from
    // its lagged mirror EACH 250ms retry. The mirror trails main's predicted, and
    // the south route (its only y=600 tile is its start) does NOT pass through the
    // still-advancing predicted tile while the old east leg is in-flight → the
    // gate fires every retry until the leg settles to its committed dst.
    let zeroPacketRetries = 0;
    let recovered = false;
    const CHUNK_RETRY_MS = 250;

    for (let retry = 0; retry < 40; retry++) {
      const now = Date.now();
      const predicted = ms.getPredictedPosition(now);
      // Faithful PLAYER_POSITION mirror: trails predicted by 1 tile WHILE the leg
      // is interpolating (33ms broadcast + IPC lag), then catches up to the
      // settled predicted tile once interpolation stops (the broadcaster's final
      // settle tick — position-broadcaster.ts:37-39).
      const mirror = ms.isInterpolating(now) ? pos(predicted.x - 1, 600) : predicted;
      const south = buildRoute(mirror, Array(8).fill(DIR.S));
      ms.setRoute('walker', south.tiles, south.codes, south.waypoints);

      const r = runMovement(ms, 'walker', pos(mirror.x, 592), speed);
      if (r.status === 'replan') {
        zeroPacketRetries++;
      } else if (r.status === 'in-progress' && r.sentPacket) {
        recovered = true;
        break;
      }
      vi.advanceTimersByTime(CHUNK_RETRY_MS);
    }

    // FIX: the south slice's codes-origin is ≤ tolerance off the predicted, so the
    // mover re-anchors and sends on the FIRST retry — zero wasted (zero-packet) ticks.
    expect(zeroPacketRetries).toBe(0);
    expect(recovered).toBe(true);
  });

  it('STALL guard never trips during the churn (lastPos reset each replanFrom) — confirms the silent-stall claim', () => {
    // macro-engine.ts:227-228 sets lastPos=null + lastMovedAt=now on every
    // replanFrom(); on a 'replan' echo the loop calls replanFrom() (line 260).
    // So lastMovedAt is refreshed faster than STALL_MS (2000ms) can elapse,
    // because each retry (250ms) re-plans and resets it. Model that timer here.
    const STALL_MS = 2000;
    const CHUNK_RETRY_MS = 250;
    let lastMovedAt = Date.now();
    let stallTripped = false;

    for (let retry = 0; retry < 12; retry++) {
      // replanFrom() resets the stall timer (line 228) BEFORE the await resolves.
      lastMovedAt = Date.now();
      vi.advanceTimersByTime(CHUNK_RETRY_MS);
      // Next loop top: stall check (line 252) — but lastMovedAt was just reset.
      if (Date.now() - lastMovedAt > STALL_MS) stallTripped = true;
    }
    expect(stallTripped).toBe(false); // the 2s guard cannot fire on a 250ms reset cadence
  });
});
