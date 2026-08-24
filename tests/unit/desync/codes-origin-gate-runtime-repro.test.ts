/**
 * Companion to codes-origin-gate-noprogress-replan.test.ts, which feeds an
 * arbitrary OFF-route `src` directly. This file instead drives the REAL
 * `MovementState` SoT (commitMove / getPredictedPosition / setRoute / getRoute /
 * isLegInFlight) through a faithful copy of `command-sender.movement`'s decision
 * under fake timers, so `Date.now()` inside commitMove and our clock agree. It
 * answers:
 *
 *   Does main's predicted `src` realistically land OFF the *current* route's
 *   tiles during normal farming, on a src the system can actually PRODUCE?
 *
 * Asserted below:
 *   1. STEADY STATE: within one committed leg, getPredictedPosition follows the
 *      committed codes → predicted is always an on-route tile → the gate NEVER
 *      fires while the sliced route is still the stored route.
 *   2. TRIGGER: a CROSS-ROUTE replan (renderer pushes a NEW route via setRoute,
 *      which does NOT bump the epoch) while the OLD leg is still in-flight drives
 *      `src` onto a tile not on the NEW route → the gate fires on a
 *      system-produced src. This is the realistic farming case (chase / contour
 *      re-plan mid-walk).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MovementState } from '@main/session/movement-state';
import { sliceRouteFrom } from '@main/session/route-slice';
import { moveStepCount, speedTierFloorMs, chebyshev } from '@shared/lib/movement-math';
import { ARRIVE_EPSILON, ORIGIN_REANCHOR_TOLERANCE } from '@shared/constants/movement';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

const pos = (x: number, y: number): MPosition => ({ x, y });

/** Faithful copy of command-sender.ts:59-67 sumCodes (module-private). */
const sumCodes = (dest: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let { x, y } = dest;
  for (const c of codes) {
    x -= DIR_DELTA[c].x;
    y -= DIR_DELTA[c].y;
  }
  return { x, y };
};

/**
 * Faithful copy of command-sender.movement (command-sender.ts:148-195) decision,
 * on a real MovementState. Uses Date.now() exactly as the real mover does (fake
 * timers make it deterministic). Returns the same MoveChunkStatus + whether a
 * 0x36C would be sent.
 */
const runMovement = (
  ms: MovementState,
  source: string,
  finalDst: MPosition,
  speed: number,
): { status: string; dst: MPosition; sentPacket: boolean } => {
  const src = ms.getPredictedPosition(Date.now());
  if (chebyshev(src, finalDst) <= ARRIVE_EPSILON) {
    return { status: 'arrived', dst: finalDst, sentPacket: false };
  }
  const route = ms.getRoute(source);
  if (!route) return { status: 'no-route', dst: src, sentPacket: false };
  const slice = sliceRouteFrom(route, src);
  if (!slice) return { status: 'replan', dst: src, sentPacket: false };
  const codesOrigin = sumCodes(slice.dest, slice.codes);
  // FIX: re-anchor to codesOrigin within tolerance; only off-corridor drift replans.
  if (chebyshev(codesOrigin, src) > ORIGIN_REANCHOR_TOLERANCE) {
    return { status: 'replan', dst: src, sentPacket: false };
  }
  const wireSrc = codesOrigin;
  if (ms.isLegInFlight(wireSrc, slice.codes, Date.now())) {
    return { status: 'in-progress', dst: slice.dest, sentPacket: false };
  }
  const steps = moveStepCount(wireSrc, slice.dest, slice.codes);
  ms.commitMove(slice.dest, steps, speed, slice.codes, wireSrc);
  return { status: 'in-progress', dst: slice.dest, sentPacket: true };
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

describe('REPRODUCE — within a single committed leg the gate can NEVER fire', () => {
  it('steady-state corridor walk: ZERO origin-gate replans, route walked to arrival', () => {
    const ms = new MovementState();
    ms.setCharToWorld(pos(100, 100));
    const speed = 4; // perTileMs 250, floor 500
    const route = buildRoute(pos(100, 100), Array(20).fill(DIR.E));
    ms.setRoute('walker', route.tiles, route.codes, route.waypoints);

    let sends = 0;
    let gateReplans = 0;
    let arrived = false;
    for (let tick = 0; tick < 60; tick++) {
      const r = runMovement(ms, 'walker', pos(120, 100), speed);
      if (r.sentPacket) sends++;
      if (r.status === 'replan') gateReplans++;
      if (r.status === 'arrived') {
        arrived = true;
        break;
      }
      vi.advanceTimersByTime(speedTierFloorMs(speed)); // 500ms cadence
    }
    expect(sends).toBeGreaterThan(0);
    expect(gateReplans).toBe(0);
    expect(arrived).toBe(true);
  });

  it('sub-tier polling mid-leg on the SAME route still never fires the gate', () => {
    const ms = new MovementState();
    ms.setCharToWorld(pos(200, 200));
    const speed = 6; // perTileMs ≈ 167, floor 100
    const route = buildRoute(pos(200, 200), Array(12).fill(DIR.NE));
    ms.setRoute('walker', route.tiles, route.codes, route.waypoints);

    let gateReplans = 0;
    for (let tick = 0; tick < 120; tick++) {
      const r = runMovement(ms, 'walker', pos(212, 212), speed);
      if (r.status === 'replan') gateReplans++;
      if (r.status === 'arrived') break;
      vi.advanceTimersByTime(90); // poll under perTileMs to land mid-leg
    }
    expect(gateReplans).toBe(0);
  });
});

describe('FIX — cross-route replan-while-in-flight drives src off the new route → mover re-anchors', () => {
  it('renderer pushes a NEW route mid-leg; predicted off the new line → mover RE-ANCHORS and sends', () => {
    const ms = new MovementState();
    ms.setCharToWorld(pos(300, 300));
    const speed = 4; // perTileMs 250

    // Leg 1: east route committed, first chunk sent.
    const east = buildRoute(pos(300, 300), Array(12).fill(DIR.E));
    ms.setRoute('walker', east.tiles, east.codes, east.waypoints);
    const r1 = runMovement(ms, 'walker', pos(312, 300), speed);
    expect(r1.sentPacket).toBe(true);

    // Advance ~2 tiles of travel; predicted should now be (302,300) on the OLD line.
    vi.advanceTimersByTime(2 * 250 + 10);
    const midPredicted = ms.getPredictedPosition(Date.now());
    expect(midPredicted).toEqual(pos(302, 300));

    // Renderer (lagging) re-plans a NORTH-EAST diagonal route. setRoute does NOT
    // bump the epoch, so the OLD predicted leg keeps interpolating along east.
    // The NE route's tiles only intersect y=300 at its start tile.
    const ne = buildRoute(pos(301, 300), Array(6).fill(DIR.NE));
    ms.setRoute('walker', ne.tiles, ne.codes, ne.waypoints);

    const srcNow = ms.getPredictedPosition(Date.now()); // (302,300)
    const newRoute = ms.getRoute('walker')!;
    const onNewRoute = newRoute.tiles.some((t) => t.x === srcNow.x && t.y === srcNow.y);
    expect(onNewRoute).toBe(false); // genuinely off the new route — system-produced

    // A valid forward slice nonetheless exists.
    const slice = sliceRouteFrom(newRoute, srcNow)!;
    expect(slice.codes.length).toBeGreaterThan(0);

    // The off-route drift here is 1 tile (≤ tolerance) → re-anchored, not stalled.
    expect(chebyshev(sumCodes(slice.dest, slice.codes), srcNow)).toBeLessThanOrEqual(
      ORIGIN_REANCHOR_TOLERANCE,
    );
    const r2 = runMovement(ms, 'walker', pos(307, 306), speed);
    expect(r2.status).toBe('in-progress'); // FIX: re-anchored forward leg, not a zero-packet replan
    expect(r2.sentPacket).toBe(true);
  });

  it('minimal trigger: ONE tile of lag is absorbed by the re-anchor (was a zero-packet replan)', () => {
    const ms = new MovementState();
    ms.setCharToWorld(pos(400, 400));
    const speed = 4;

    const east = buildRoute(pos(400, 400), Array(8).fill(DIR.E));
    ms.setRoute('walker', east.tiles, east.codes, east.waypoints);
    runMovement(ms, 'walker', pos(408, 400), speed);

    vi.advanceTimersByTime(250 + 5); // one tile → predicted (401,400)
    const predicted = ms.getPredictedPosition(Date.now());
    expect(predicted).toEqual(pos(401, 400));

    // Renderer mirror still reads (400,400) (one PLAYER_POSITION broadcast behind).
    const laggedMirror = pos(400, 400);
    expect(chebyshev(predicted, laggedMirror)).toBe(1);

    // Renderer re-plans a SOUTH route from its lagged mirror.
    const south = buildRoute(laggedMirror, Array(4).fill(DIR.S));
    ms.setRoute('walker', south.tiles, south.codes, south.waypoints);
    const onSouth = south.tiles.some((t) => t.x === predicted.x && t.y === predicted.y);
    expect(onSouth).toBe(false);

    const r = runMovement(ms, 'walker', pos(400, 396), speed);
    expect(r.status).toBe('in-progress'); // FIX: a single tile of lag is re-anchored, not replanned
    expect(r.sentPacket).toBe(true);
  });
});

describe('REPRODUCE — does the renderer recover, or does it churn?', () => {
  it('after a gate replan the renderer re-plans from its (still-lagged) mirror — but the NEXT main slice CAN now succeed once predicted settles', () => {
    // This models the recovery loop: macro-engine.ts:259-262 replanFrom() on
    // 'replan'. The renderer re-plans from its mirror; the new route starts at the
    // mirror tile. If by the next execute the predicted leg has FINISHED (no more
    // in-flight interpolation), getPredictedPosition == the committed dst, and the
    // re-planned route can be sliced coherently. So the stall is TRANSIENT per
    // replan, not a hard deadlock — but it costs a full CHUNK_RETRY_MS + a wasted
    // tick each time the geometry re-triggers.
    const ms = new MovementState();
    ms.setCharToWorld(pos(500, 500));
    const speed = 4;

    const east = buildRoute(pos(500, 500), Array(12).fill(DIR.E));
    ms.setRoute('walker', east.tiles, east.codes, east.waypoints);
    runMovement(ms, 'walker', pos(512, 500), speed);

    // Let the WHOLE committed leg finish so predicted == confirmed dst (512,500).
    vi.advanceTimersByTime(12 * 250 + 50);
    const settled = ms.getPredictedPosition(Date.now());
    expect(settled).toEqual(pos(512, 500));

    // Renderer re-plans from the settled position (now mirror has caught up).
    const cont = buildRoute(pos(512, 500), Array(6).fill(DIR.E));
    ms.setRoute('walker', cont.tiles, cont.codes, cont.waypoints);

    const r = runMovement(ms, 'walker', pos(518, 500), speed);
    expect(r.status).toBe('in-progress'); // recovered once predicted settled
    expect(r.sentPacket).toBe(true);
  });
});
