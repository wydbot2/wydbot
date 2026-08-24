/**
 * Walkability service — renderer-side singleton.
 *
 * The 4096² world heightmap (i8, wall-baked main-side) is fetched once from main
 * and cached; canStep / hasLineOfWalk / getHeight are SYNC after `ready()`.
 *
 *   - canStep / hasLineOfWalk: ±8 height rule + 0x7F sentinel (heightmap only).
 *   - searchRoute: whole-route A* (bounded by MAX_LEG_STEPS), corridor-bounded;
 *     returns the contiguous tiles + codes + status for the caller to segment into legs.
 *
 * Walls (AttributeMap 0x02 + object.bin silhouettes) are baked into the heightmap
 * by main, so the ±8 rule alone contours buildings — no separate collision mask.
 */

import {
  BLOCKED_SENTINEL,
  DIR,
  DIR_DELTA,
  HEIGHT_TOLERANCE,
  MAX_LINE_TILES,
  WORLD_SIZE,
  type DirectionCode,
  type RouteStatus,
} from '@shared/ipc/walkability';
import { MAX_LEG_STEPS, MAX_STEP_DISTANCE } from '@shared/constants/movement';
import type { MPosition } from '@shared/types';

export interface WalkabilityService {
  /** Resolves once the heightmap has been fetched and indexed. Idempotent. */
  ready(): Promise<void>;

  /**
   * True iff stepping from (fx,fy) to (tx,ty) clears the ±8 height test.
   * Out-of-bounds endpoints → false. Step length is NOT enforced here — the
   * caller decides whether the move is 1 tile or longer.
   */
  canStep(fx: number, fy: number, tx: number, ty: number): boolean;

  /** Whole-route A*; `opts.avoid` = tile keys (`y * WORLD_SIZE + x`) blocked for this call. */
  searchRoute(
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    opts?: { avoid?: ReadonlySet<number> },
  ): { tiles: MPosition[]; codes: DirectionCode[]; status: RouteStatus };

  /**
   * Bounded reachability probe sharing the searchRoute A* core: is (tx,ty)
   * reachable from (fx,fy) within `maxRouteSteps` A* steps (contour-aware, not
   * straight-line)? Returns the status plus the reached/nearest-frontier tile.
   * Cheaper than searchRoute (no path reconstruction, fixed corridor = budget).
   */
  reachableWithin(
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    maxRouteSteps: number,
  ): { status: RouteStatus; frontier: MPosition | null };

  /**
   * True iff a straight Bresenham line from (fx,fy) to (tx,ty) is fully
   * walkable: every traversed cell within ±8 of its predecessor and no cell
   */
  hasLineOfWalk(fx: number, fy: number, tx: number, ty: number): boolean;

  /**
   * String-pulls an A* route into greedy-reachable waypoint indices: each
   * consecutive waypoint is `hasLineOfWalk`-reachable from the previous, capped
   * at `MAX_STEP_DISTANCE`. The corners around an obstacle become waypoints, so
   * the mover streams legs the (greedy) server can reproduce. Returns strictly
   * increasing indices into `tiles`, always ending at the last tile.
   */
  stringPullRoute(tiles: readonly MPosition[]): number[];

  /** Raw height byte. Returns `BLOCKED_SENTINEL` for out-of-bounds. */
  getHeight(x: number, y: number): number;
}

// ─── singleton state ──────────────────────────────────────────────────────

let heightmap: Int8Array | null = null;
let readyPromise: Promise<void> | null = null;

const inBounds = (x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE;

const heightAt = (x: number, y: number): number => {
  if (!heightmap) throw new Error('walkability-service: heightmap not loaded (await ready())');
  if (!inBounds(x, y)) return BLOCKED_SENTINEL;
  return heightmap[y * WORLD_SIZE + x];
};

const stepCleared = (fromH: number, toH: number): boolean => {
  if (toH === BLOCKED_SENTINEL || fromH === BLOCKED_SENTINEL) return false;
  const d = toH - fromH;
  // Strict bound (|Δh| ≤ 7): canonical admits a step iff `cur-8 < h(next) < cur+8`.
  return d < HEIGHT_TOLERANCE && d > -HEIGHT_TOLERANCE;
};

// ─── canStep ──────────────────────────────────────────────────────────────

const canStepImpl = (fx: number, fy: number, tx: number, ty: number): boolean => {
  if (!inBounds(fx, fy) || !inBounds(tx, ty)) return false;
  return stepCleared(heightAt(fx, fy), heightAt(tx, ty));
};

// ─── hasLineOfWalk ────────────────────────────────────────────────────────
//
// supercover from src→dst, comparing each cell's height against the previous
// cell. Bails the moment a cell exceeds ±8 or hits 0x7F. Capped at
// MAX_LINE_TILES (30, Chebyshev) per canonical behaviour.

const hasLineOfWalkImpl = (fx: number, fy: number, tx: number, ty: number): boolean => {
  if (!inBounds(fx, fy) || !inBounds(tx, ty)) return false;

  const dxAbs = Math.abs(tx - fx);
  const dyAbs = Math.abs(ty - fy);
  if (Math.max(dxAbs, dyAbs) > MAX_LINE_TILES) return false;

  let x = fx;
  let y = fy;
  let prevH = heightAt(x, y);
  if (prevH === BLOCKED_SENTINEL) return false;

  const sx = fx < tx ? 1 : -1;
  const sy = fy < ty ? 1 : -1;
  let err = dxAbs - dyAbs;

  // Standard Bresenham; same step iteration as the disassembly.
  while (x !== tx || y !== ty) {
    const e2 = err * 2;
    if (e2 > -dyAbs) {
      err -= dyAbs;
      x += sx;
    }
    if (e2 < dxAbs) {
      err += dxAbs;
      y += sy;
    }
    const h = heightAt(x, y);
    if (!stepCleared(prevH, h)) return false;
    prevH = h;
  }
  return true;
};

// ─── string-pull (route → greedy-reachable waypoints) ───────────────────────
//
// Reduces the A* contour to waypoints where each consecutive pair is straight line-of-walk
// reachable (≤ MAX_STEP_DISTANCE). The server's greedy pathfinder reproduces a straight leg
// but not a contour, so the mover streams these legs. `isClear` is injected for testing.

const stringPullWaypoints = (
  tiles: readonly MPosition[],
  isClear: (a: MPosition, b: MPosition) => boolean,
): number[] => {
  if (tiles.length <= 1) return [];
  const cheb = (a: MPosition, b: MPosition): number =>
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  const waypoints: number[] = [];
  let legStart = 0;
  for (let i = 1; i < tiles.length; i++) {
    if (
      cheb(tiles[legStart], tiles[i]) <= MAX_STEP_DISTANCE &&
      isClear(tiles[legStart], tiles[i])
    ) {
      continue;
    }
    waypoints.push(i - 1);
    legStart = i - 1;
  }
  waypoints.push(tiles.length - 1);
  return waypoints;
};

const stringPullRouteImpl = (tiles: readonly MPosition[]): number[] =>
  stringPullWaypoints(tiles, (a, b) => hasLineOfWalkImpl(a.x, a.y, b.x, b.y));

// ─── A* core (shared by searchRoute + reachableWithin) ──────────────────────

interface AStarNode {
  x: number;
  y: number;
  /** Path cost (pure step count) used for ordering/dedup. */
  g: number;
  /** Edge count; gates the step budget. */
  steps: number;
  f: number;
  /** Heuristic (Chebyshev to goal); secondary heap key — breaks equal-f plateaus toward the goal. */
  h: number;
  parent: AStarNode | null;
  dir: DirectionCode | 0;
}

// Lower f wins; on equal f prefer lower h — collapses the large equal-f plateaus (exact
// Chebyshev heuristic) into straight diagonals instead of bulging ones.
const higherPriority = (a: AStarNode, b: AStarNode): boolean =>
  a.f < b.f || (a.f === b.f && a.h < b.h);

interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Neighbour scan order (preserves A* tie-break); each step's delta comes from the
// shared DIR_DELTA so the code→tile mapping has a single source of truth.
const NEIGHBOUR_CODES: readonly DirectionCode[] = [
  DIR.SW,
  DIR.S,
  DIR.SE,
  DIR.W,
  DIR.E,
  DIR.NW,
  DIR.N,
  DIR.NE,
];

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const buildAabb = (fx: number, fy: number, tx: number, ty: number, margin: number): AABB => ({
  minX: Math.max(0, Math.min(fx, tx) - margin),
  minY: Math.max(0, Math.min(fy, ty) - margin),
  maxX: Math.min(WORLD_SIZE - 1, Math.max(fx, tx) + margin),
  maxY: Math.min(WORLD_SIZE - 1, Math.max(fy, ty) + margin),
});

/** Walk the parent chain into the contiguous tile list + the codes that produced it. */
const reconstructPath = (goal: AStarNode): { tiles: MPosition[]; codes: DirectionCode[] } => {
  const tiles: MPosition[] = [];
  const codes: DirectionCode[] = [];
  let cur: AStarNode | null = goal;
  while (cur) {
    tiles.push({ x: cur.x, y: cur.y });
    if (cur.dir !== 0) codes.push(cur.dir);
    cur = cur.parent;
  }
  tiles.reverse();
  codes.reverse();
  return { tiles, codes };
};

/** Corridor half-width (tiles) the route search starts with; ×2 on bbox-exhaustion. */
const ROUTE_MARGIN_START = 12;
/** Max corridor half-width before the widen-and-retry loop gives up. */
const ROUTE_MARGIN_MAX = 96;
/** Hard ceiling on closed nodes per searchRoute; on hit, return the best frontier (partial). */
const ROUTE_NODE_BUDGET = 40_000;

interface SearchOpts {
  bbox: AABB;
  /** Step-count prune: nodes with `steps >= maxSteps` are not expanded. */
  maxSteps: number;
  /** Stop once `closed.size` exceeds this (bbox-independent escape hatch). */
  nodeBudget: number;
  /** When the goal is unreached, return the nearest-to-goal closed node instead of null. */
  allowPartial: boolean;
  avoid?: ReadonlySet<number>;
}

interface SearchResult {
  /** Goal node when `reached`; nearest frontier when `allowPartial`; else null. */
  node: AStarNode | null;
  reached: boolean;
  /** True when the open set emptied (corridor too small) vs. a node-budget cut. */
  exhaustedOpen: boolean;
}

// 8-connected A*, ±8 gate + canonical corner-cut, Chebyshev heuristic; bounded by
// the bbox corridor, maxSteps budget, and node ceiling. g = step count.
const aStarCore = (
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  opts: SearchOpts,
): SearchResult => {
  const startH = heightAt(fx, fy);
  const goalH = heightAt(tx, ty);
  if (startH === BLOCKED_SENTINEL || goalH === BLOCKED_SENTINEL) {
    return { node: null, reached: false, exhaustedOpen: true };
  }

  const { bbox, maxSteps, nodeBudget, allowPartial, avoid } = opts;

  // Simple binary-heap open set. The bounded AABB keeps node counts low
  // enough that a linear-scan heap would also be fine, but the proper heap
  // costs us nothing.
  const open: AStarNode[] = [];
  const closed = new Set<number>();
  const bestG = new Map<number, number>();

  const heapKey = (x: number, y: number): number => y * WORLD_SIZE + x;

  const push = (node: AStarNode): void => {
    open.push(node);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!higherPriority(open[i], open[p])) break;
      const tmp = open[p];
      open[p] = open[i];
      open[i] = tmp;
      i = p;
    }
  };

  const pop = (): AStarNode | undefined => {
    const top = open[0];
    const last = open.pop();
    if (open.length && last) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < open.length && higherPriority(open[l], open[best])) best = l;
        if (r < open.length && higherPriority(open[r], open[best])) best = r;
        if (best === i) break;
        const tmp = open[best];
        open[best] = open[i];
        open[i] = tmp;
        i = best;
      }
    }
    return top;
  };

  const startNode: AStarNode = {
    x: fx,
    y: fy,
    g: 0,
    steps: 0,
    f: chebyshev(fx, fy, tx, ty),
    h: chebyshev(fx, fy, tx, ty),
    parent: null,
    dir: 0,
  };
  push(startNode);
  bestG.set(heapKey(fx, fy), 0);

  let bestNode = startNode;
  let bestH = chebyshev(fx, fy, tx, ty);

  let node: AStarNode | undefined;

  while ((node = pop())) {
    if (node.x === tx && node.y === ty) {
      return { node, reached: true, exhaustedOpen: false };
    }

    const key = heapKey(node.x, node.y);
    if (closed.has(key)) continue;
    closed.add(key);

    if (closed.size > nodeBudget) {
      return { node: allowPartial ? bestNode : null, reached: false, exhaustedOpen: false };
    }

    const h = chebyshev(node.x, node.y, tx, ty);
    if (h < bestH) {
      bestH = h;
      bestNode = node;
    }

    // Pruning by pure step count — independent of the attribute penalty in `g`.
    if (node.steps >= maxSteps) continue;

    const curH = heightAt(node.x, node.y);
    for (const code of NEIGHBOUR_CODES) {
      const { x: dx, y: dy } = DIR_DELTA[code];
      const nx = node.x + dx;
      const ny = node.y + dy;
      if (nx < bbox.minX || ny < bbox.minY || nx > bbox.maxX || ny > bbox.maxY) continue;

      const nh = heightAt(nx, ny);
      if (!stepCleared(curH, nh)) continue;

      if (dx !== 0 && dy !== 0) {
        const hx = heightAt(node.x + dx, node.y);
        const hy = heightAt(node.x, node.y + dy);
        const flankXWalkable = stepCleared(curH, hx) && !avoid?.has(heapKey(node.x + dx, node.y));
        const flankYWalkable = stepCleared(curH, hy) && !avoid?.has(heapKey(node.x, node.y + dy));
        if (!flankXWalkable && !flankYWalkable) continue;
      }

      const nsteps = node.steps + 1;
      const ng = node.g + 1;
      const nkey = heapKey(nx, ny);
      // Avoid gates transit only — the query's goal is always enterable (the
      // origin is exempt by construction: it is pushed without an avoid check).
      if (avoid?.has(nkey) && !(nx === tx && ny === ty)) continue;
      const prev = bestG.get(nkey);
      if (prev !== undefined && prev <= ng) continue;
      bestG.set(nkey, ng);

      const nHeu = chebyshev(nx, ny, tx, ty);
      push({
        x: nx,
        y: ny,
        g: ng,
        steps: nsteps,
        f: ng + nHeu,
        h: nHeu,
        parent: node,
        dir: code,
      });
    }
  }
  return { node: allowPartial ? bestNode : null, reached: false, exhaustedOpen: true };
};

const searchRouteImpl = (
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  opts?: { avoid?: ReadonlySet<number> },
): { tiles: MPosition[]; codes: DirectionCode[]; status: RouteStatus } => {
  if (!inBounds(fx, fy) || !inBounds(tx, ty))
    return { tiles: [], codes: [], status: 'unreachable' };
  if (fx === tx && fy === ty) return { tiles: [{ x: fx, y: fy }], codes: [], status: 'complete' };

  let margin = ROUTE_MARGIN_START;
  let attempt = aStarCore(fx, fy, tx, ty, {
    bbox: buildAabb(fx, fy, tx, ty, margin),
    maxSteps: MAX_LEG_STEPS,
    nodeBudget: ROUTE_NODE_BUDGET,
    allowPartial: true,
    avoid: opts?.avoid,
  });
  // Widen the corridor only while the open set emptied (the bbox, not the node
  // budget, was the limit) and the goal is still unreached.
  while (!attempt.reached && attempt.exhaustedOpen && margin < ROUTE_MARGIN_MAX) {
    margin = Math.min(margin * 2, ROUTE_MARGIN_MAX);
    attempt = aStarCore(fx, fy, tx, ty, {
      bbox: buildAabb(fx, fy, tx, ty, margin),
      maxSteps: MAX_LEG_STEPS,
      nodeBudget: ROUTE_NODE_BUDGET,
      allowPartial: true,
      avoid: opts?.avoid,
    });
  }

  if (attempt.reached && attempt.node) {
    const { tiles, codes } = reconstructPath(attempt.node);
    return { tiles, codes, status: 'complete' };
  }
  if (attempt.node) {
    const { tiles, codes } = reconstructPath(attempt.node);
    if (tiles.length >= 2) return { tiles, codes, status: 'partial' };
  }
  return { tiles: [], codes: [], status: 'unreachable' };
};

const reachableWithinImpl = (
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  maxRouteSteps: number,
): { status: RouteStatus; frontier: MPosition | null } => {
  if (!inBounds(fx, fy) || !inBounds(tx, ty)) return { status: 'unreachable', frontier: null };
  if (fx === tx && fy === ty) return { status: 'complete', frontier: { x: fx, y: fy } };

  const r = aStarCore(fx, fy, tx, ty, {
    bbox: buildAabb(fx, fy, tx, ty, maxRouteSteps),
    maxSteps: maxRouteSteps,
    nodeBudget: ROUTE_NODE_BUDGET,
    allowPartial: true,
  });
  if (r.reached && r.node) {
    return { status: 'complete', frontier: { x: r.node.x, y: r.node.y } };
  }
  // A frontier of just the start tile (no forward progress) is unreachable, matching
  // searchRoute's ≥2-tile partial rule.
  if (r.node && r.node.steps >= 1) {
    return { status: 'partial', frontier: { x: r.node.x, y: r.node.y } };
  }
  return { status: 'unreachable', frontier: null };
};

// ─── service factory ──────────────────────────────────────────────────────

const ensureLoaded = async (): Promise<void> => {
  if (heightmap) return;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const api = window.wydAPI;
    if (!api || typeof api.getWalkabilityHeightmap !== 'function') {
      throw new Error('walkability-service: window.wydAPI.getWalkabilityHeightmap unavailable');
    }
    const { buffer, meta } = await api.getWalkabilityHeightmap();
    if (meta.width !== WORLD_SIZE || meta.height !== WORLD_SIZE) {
      throw new Error(
        `walkability-service: bad heightmap size ${meta.width}×${meta.height} (expected ${WORLD_SIZE}²)`,
      );
    }
    if (buffer.byteLength !== WORLD_SIZE * WORLD_SIZE) {
      throw new Error(
        `walkability-service: heightmap buffer size mismatch (${buffer.byteLength} bytes)`,
      );
    }
    heightmap = new Int8Array(buffer);
  })();

  try {
    await readyPromise;
  } catch (err) {
    readyPromise = null;
    throw err;
  }
};

let singleton: WalkabilityService | null = null;

export const getWalkabilityService = (): WalkabilityService => {
  if (singleton) return singleton;
  singleton = {
    ready: ensureLoaded,
    canStep: canStepImpl,
    searchRoute: searchRouteImpl,
    reachableWithin: reachableWithinImpl,
    hasLineOfWalk: hasLineOfWalkImpl,
    stringPullRoute: stringPullRouteImpl,
    getHeight: heightAt,
  };
  return singleton;
};

export { stringPullWaypoints };
