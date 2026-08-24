export const MAX_STEP_DISTANCE = 12;

/** Within this Chebyshev distance of the target counts as arrived (predicted settles ±1). */
export const ARRIVE_EPSILON = 1;

/** UI/validator threshold: walks above this distance are treated as post-teleport jumps, not typos. */
export const TELEPORT_THRESHOLD = 50;

/**
 * Runtime reachability threshold (Chebyshev), 25% slack over MAX_STEP_DISTANCE.
 * Backs the main-side origin-coherence gate that refuses a 0x36C whose source is
 * farther than this from its destination — the server rejects beyond it.
 */
export const MAX_EXECUTION_DISTANCE = 15;

/**
 * The single leg budget: a waypoint/approach reachable within this many A* steps
 * (contour-aware) is walked; beyond it the target is treated as displaced/sealed and
 * the step is skipped. It is the ONE knob governing both the route the macro walks
 * (`searchRoute` cap) and the approach picker's reachability probe (`reachableWithin`).
 * Cost is bounded separately by `ROUTE_NODE_BUDGET`. Large enough for a full
 * building contour (~32 tiles).
 */
export const MAX_LEG_STEPS = 50;

/**
 * Max Chebyshev drift between main's predicted `src` and a sliced chunk's true
 * codes-origin that the mover RE-ANCHORS (sends `lastPosition = codesOrigin`)
 * instead of returning a zero-packet replan. Routes are contiguous, so the
 * origin gate otherwise collapses to "predicted exactly on a route tile" and a
 * single tile of renderer↔main IPC lag stalls forward progress. The server
 * replays codes from the claimed origin and only rubberbands past ~0x22 (34)
 * tiles, so a ≤2-tile re-anchor is well inside tolerance; beyond it the
 * predicted has left the planned corridor (stale route) and a replan from the
 * live tile is the correct recovery.
 */
export const ORIGIN_REANCHOR_TOLERANCE = 2;

/**
 * Max Chebyshev divergence between an inbound 0x36C's `src` and the main-side
 * predicted position for the packet to be treated as STEERING instead of a
 * `LAB_00557db5`, past 0x22=34 tiles/axis): replay the server's codes and walk
 * to its dst. The canonical 34-tile bound is far past our planned routes'
 * validity, so we align with ORIGIN_REANCHOR_TOLERANCE: a ≤2-tile correction
 * (e.g. occupied target tile → adjacent dst) walks instead of teleport-snapping.
 */
export const SERVER_MOVE_SRC_TOLERANCE = 2;
