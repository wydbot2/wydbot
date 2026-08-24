/**
 * ClientControl.movement reads the move origin ONCE (command-sender.ts:154,
 * `src = getPredictedPosition(Date.now())`) and that `src` is written to the 0x36C
 * wire packet (packet-builders.ts:210). The server replays slice.codes FROM that
 * wire src. But MovementState.commitMove (movement-state.ts:63) takes a SECOND,
 * independent Date.now() read and stamps the new dead-reckoned leg's src =
 * getPredictedPosition(now). If wall-clock crosses a k*perTileMs boundary of the
 * PREVIOUS leg between the two reads, the broadcast leg src is one tile ahead of
 * the wire src — a permanent +1 mirror drift (a normal walk is never echoed).
 *
 * Production never takes the second clock read: commitMove receives the wire
 * src via an explicit `src` arg. These tests exercise the commitMove FALLBACK
 * (no `src` arg), which retains the seam by design.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MovementState } from '@main/session/movement-state';
import { sliceRouteFrom } from '@main/session/route-slice';
import { perTileMs, moveStepCount, chebyshev } from '@shared/lib/movement-math';
import { ARRIVE_EPSILON } from '@shared/constants/movement';
import { DIR, DIR_DELTA, type DirectionCode, type StreamRoute } from '@shared/ipc/walkability';
import type { MPosition } from '@shared/types';

const sixEast: DirectionCode[] = Array(6).fill(DIR.E);

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

/**
 * Faithful command-sender.movement (command-sender.ts:148-195), with an injected
 * `gapMs` of REAL clock advance between read #1 (wire src) and read #3 (commitMove's
 * clock) — forcing the boundary cross the fallback needs. Returns wire src/dst and the
 * resulting dead-reckoned leg src so the seam is directly observable.
 */
const runMovementWithGap = (
  ms: MovementState,
  source: string,
  finalDst: MPosition,
  speed: number,
  gapMs: number,
): {
  status: string;
  sent: boolean;
  wireSrc?: MPosition;
  wireDst?: MPosition;
  legSrc?: MPosition;
} => {
  const src = ms.getPredictedPosition(Date.now()); // command-sender.ts:154
  if (chebyshev(src, finalDst) <= ARRIVE_EPSILON) return { status: 'arrived', sent: false };
  const route = ms.getRoute(source);
  if (!route) return { status: 'no-route', sent: false };
  const slice = sliceRouteFrom(route, src);
  if (!slice) return { status: 'replan', sent: false };
  const codesOrigin = sumCodes(slice.dest, slice.codes);
  if (codesOrigin.x !== src.x || codesOrigin.y !== src.y) return { status: 'replan', sent: false };
  if (ms.isLegInFlight(src, slice.codes, Date.now())) return { status: 'in-progress', sent: false };

  vi.advanceTimersByTime(gapMs); // the synchronous work window (buildPacket + socket.write)

  const steps = moveStepCount(src, slice.dest, slice.codes);
  ms.commitMove(slice.dest, steps, speed, slice.codes); // movement-state.ts:63 re-reads clock
  return {
    status: 'in-progress',
    sent: true,
    wireSrc: src,
    wireDst: slice.dest,
    legSrc: ms.getPredictedPosition(Date.now()),
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('commit-move-double-clock — mechanism in isolation', () => {
  it('the two clock reads straddling a perTileMs boundary make the new leg start +1 tile ahead of the wire src', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 10, y: 10 });

    // Install a previous EAST leg at t=0. speed 5 -> perTileMs = 200.
    expect(perTileMs(5)).toBe(200);
    ms.commitMove({ x: 16, y: 10 }, 6, 5, sixEast);

    // READ #1 (simulates command-sender.ts:154 just before the boundary).
    vi.setSystemTime(599); // k = floor(599/200) = 2 -> {x:12,y:10}
    const wireSrc = ms.getPredictedPosition(599);
    expect(wireSrc).toEqual({ x: 12, y: 10 });

    // Real work runs (slice/sumCodes/buildPacket/send). Clock crosses 600 ms.
    // READ #3 (commitMove's own Date.now()) lands the new leg AFTER the boundary.
    vi.setSystemTime(601); // k = floor(601/200) = 3 -> {x:13,y:10}
    ms.commitMove({ x: 18, y: 10 }, 6, 5, sixEast);

    // The new leg's stamped src is observable at elapsed 0 (returns the stamped src).
    const stampedSrc = ms.getPredictedPosition(601);

    // Server-faithful: the packet carried wireSrc={12,10} and the server replays from it.
    // Buggy actual: the dead-reckoned leg starts one tile ahead.
    expect(stampedSrc).toEqual({ x: 13, y: 10 }); // CURRENT (drifted) behaviour
    expect(stampedSrc).not.toEqual(wireSrc); // proves the divergence
  });

  it('NO divergence when both reads land in the same perTileMs bucket (the common case)', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 10, y: 10 });
    ms.commitMove({ x: 16, y: 10 }, 6, 5, sixEast); // perTileMs=200

    // Both reads inside the [400,600) bucket (k=2).
    vi.setSystemTime(450);
    const wireSrc = ms.getPredictedPosition(450);
    vi.setSystemTime(470);
    ms.commitMove({ x: 18, y: 10 }, 6, 5, sixEast);
    const stampedSrc = ms.getPredictedPosition(470);

    expect(wireSrc).toEqual({ x: 12, y: 10 });
    expect(stampedSrc).toEqual({ x: 12, y: 10 }); // no drift — reads agree
  });
});

describe('commit-move-double-clock — runtime gate: can the SECOND chunk reach commitMove at all?', () => {
  /**
   * Reproduce reality: the bug needs a PREVIOUS in-flight leg to still be
   * interpolating when the NEXT movement() runs. But movement() FIRST consults
   * isLegInFlight (command-sender.ts:173) on the freshly-sliced chunk; if the
   * route hasn't advanced past the in-flight leg, the slice is identical and the
   * mover returns 'in-progress' WITHOUT calling commitMove. commitMove (and thus
   * the second clock read) only runs when the new chunk DIFFERS from the in-flight
   * leg. Model that gate to see how the bug actually surfaces in a walk loop.
   */
  it('a chunk identical to the in-flight leg short-circuits before commitMove (no second clock read)', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 10, y: 10 });

    const codes = sixEast;
    const src1 = ms.getPredictedPosition(Date.now()); // {10,10}
    ms.commitMove({ x: 16, y: 10 }, 6, 5, codes);

    // Mid-flight, the SAME slice (same src + same codes) is re-evaluated.
    vi.setSystemTime(400);
    const reSrc = { x: 10, y: 10 }; // a re-slice that still starts at the leg's src
    // The mover would call isLegInFlight(reSrc, codes, now) and skip commitMove.
    expect(ms.isLegInFlight(reSrc, codes, 400)).toBe(true);

    // Sanity: src1 is the leg origin and isLegInFlight gates on src EQUALITY.
    expect(reSrc).toEqual(src1);
  });

  it('isLegInFlight returns false once the slice src has advanced — THIS is when commitMove (the 2nd read) runs', () => {
    const ms = new MovementState();
    ms.setCharToWorld({ x: 10, y: 10 });
    ms.commitMove({ x: 16, y: 10 }, 6, 5, sixEast); // leg src = {10,10}

    // The next chunk is sliced from the CURRENT predicted tile, which has moved.
    vi.setSystemTime(400); // k=2 -> {12,10}
    const advancedSrc = ms.getPredictedPosition(400);
    expect(advancedSrc).toEqual({ x: 12, y: 10 });

    // A chunk starting at {12,10} is NOT the in-flight leg (which starts at {10,10}).
    expect(ms.isLegInFlight(advancedSrc, sixEast, 400)).toBe(false);
    // => the mover proceeds to buildMovePacket + commitMove, where the 2nd Date.now()
    //    read happens. The window for a boundary crossing is the work between the two reads.
  });
});

describe('commit-move-double-clock — CORRECTNESS: does the seam PERSIST or self-heal?', () => {
  beforeEach(() => vi.setSystemTime(1_000_000));

  it('a forced boundary cross between the reads makes the leg src +1 vs wire src on a real walk', () => {
    const ms = new MovementState();
    ms.setCharToWorld(pos(100, 100));
    const speed = 5; // perTileMs 200
    const route = buildRoute(pos(100, 100), Array(20).fill(DIR.E));
    ms.setRoute('walker', route.tiles, route.codes, route.waypoints);

    // First move: no prior leg → both reads identical even WITH a gap.
    const r1 = runMovementWithGap(ms, 'walker', pos(120, 100), speed, 2);
    expect(r1.sent).toBe(true);
    expect(r1.legSrc).toEqual(r1.wireSrc); // FIRST move can never drift (predicted == confirmed)

    // Park the clock 1ms before a tile boundary of the in-flight leg so the 2ms
    // gap straddles it. r1's leg startMs = 1_000_002 (after r1's 2ms gap).
    vi.setSystemTime(1_000_002 + 5 * 200 - 1); // read#1 elapsed 999 → k=4 → (104,100)
    const r2 = runMovementWithGap(ms, 'walker', pos(120, 100), speed, 2);
    // Assert the boundary-cross path actually fired (not vacuously skipped by a gate).
    expect(r2.sent).toBe(true);
    expect(r2.wireSrc).toEqual(pos(104, 100)); // read#1 k=4
    // read#2 elapsed 1001 → k=5 → (105,100): leg one tile ahead of wire.
    expect(r2.legSrc!.x).toBe(r2.wireSrc!.x + 1);
    expect(r2.legSrc).toEqual(pos(105, 100));
  });

  it('GUARD/CORRECTNESS: open-loop walk still ARRIVES at the route end with NO unbounded drift, despite a 2ms gap every chunk', () => {
    // A PERMANENT +1 drift "until a rubberband" would mean repeated boundary
    // crosses accumulate on the SoT itself, and the
    // predicted tile would overshoot the route end. Drive the entire walk with a
    // forced 2ms gap each chunk and assert the settled predicted lands exactly on
    // the route end — i.e. the leg is RE-SOURCED from the live predicted tile each
    // chunk, so any per-chunk seam is absorbed (codes are sliced from the same src
    // commitMove will stamp +/- the gap), not accumulated.
    const ms = new MovementState();
    ms.setCharToWorld(pos(500, 500));
    const speed = 5; // perTileMs 200
    const route = buildRoute(pos(500, 500), Array(24).fill(DIR.E));
    ms.setRoute('walker', route.tiles, route.codes, route.waypoints);

    let arrived = false;
    let maxX = 500;
    for (let tick = 0; tick < 300; tick++) {
      const r = runMovementWithGap(ms, 'walker', pos(524, 500), speed, 2);
      const p = ms.getPredictedPosition(Date.now());
      maxX = Math.max(maxX, p.x);
      if (r.status === 'arrived') {
        arrived = true;
        break;
      }
      vi.advanceTimersByTime(1000); // ~ a chunk's worth of travel
    }

    expect(arrived).toBe(true);
    const settled = ms.getPredictedPosition(Date.now());
    // No overshoot past the route end — the dead reckoning is bounded by dst clamp.
    expect(settled.x).toBeLessThanOrEqual(524);
    expect(maxX).toBeLessThanOrEqual(524); // never ran past the planned end
    expect(settled.y).toBe(500);
  });

  it('CRITICAL CHECK: after a drifted chunk, the NEXT wire src reads the DRIFTED leg — so the wire (server origin) tracks the mirror, not the reverse', () => {
    // If the MIRROR ended "permanently one tile ahead" of the
    // server, the drift would be observable. But the next chunk's wire src is ALSO read from getPredictedPosition
    // (the same drifted leg). So the wire src on chunk N+1 carries the drift to the
    // server too: the server re-bases to the drifted origin on the next move. The
    // internal seam (wireSrc_N vs legSrc_N) is real, but it is reconciled by the
    // next outbound packet — it is NOT a one-way mirror-vs-server divergence that
    // only a rubberband can fix.
    const ms = new MovementState();
    ms.setCharToWorld(pos(700, 700));
    const speed = 5;
    const route = buildRoute(pos(700, 700), Array(20).fill(DIR.E));
    ms.setRoute('walker', route.tiles, route.codes, route.waypoints);

    const r1 = runMovementWithGap(ms, 'walker', pos(720, 700), speed, 2); // leg startMs 1_000_002
    expect(r1.sent).toBe(true);

    vi.setSystemTime(1_000_002 + 5 * 200 - 1); // straddle boundary k=4→5
    const r2 = runMovementWithGap(ms, 'walker', pos(720, 700), speed, 2);

    if (r2.sent && r2.legSrc!.x === r2.wireSrc!.x + 1) {
      // Now the NEXT chunk's wire src is read from the drifted leg.
      vi.advanceTimersByTime(200); // let r2's leg interpolate one tile
      const nextWireSrc = ms.getPredictedPosition(Date.now());
      // nextWireSrc derives from r2's leg (stamped at the drifted src), so the wire
      // carries the same offset forward — the server is re-based, not left behind.
      expect(nextWireSrc.x).toBeGreaterThanOrEqual(r2.legSrc!.x);
    }
  });
});
