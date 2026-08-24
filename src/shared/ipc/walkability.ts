/**
 * Walkability service — shared types and constants.
 *
 * The world heightmap is the SOLE canonical walkability source (per
 * Phase 1 RE). One 4096×4096 i8 buffer is shipped from
 * main to renderer at boot (zero-copy `ArrayBuffer`), and every query
 * (canStep / searchRoute / hasLineOfWalk) is a synchronous TypeScript call.
 *
 * Algorithm semantics MUST mirror the game:
 */

import type { MPosition } from '@shared/types';

/** World heightmap is a square grid of `WORLD_SIZE × WORLD_SIZE` int8 cells. */
export const WORLD_SIZE = 4096;

/** Hard-wired height tolerance enforced by every canonical caller. */
export const HEIGHT_TOLERANCE = 8;

/**
 * lookups and used as an early-out by line-walk. Real disk value +127 (e.g.
 * `Field0815.trn`) collides with the sentinel — treat both as walls.
 */
export const BLOCKED_SENTINEL = 0x7f;

export const MAX_LINE_TILES = 30;

/** Outcome of a whole-route plan (`searchRoute`). */
export type RouteStatus = 'complete' | 'partial' | 'unreachable';

/** A contiguous route: `tiles[i+1]` is reached by `codes[i]` from `tiles[i]`. */
export interface StreamRoute {
  readonly tiles: readonly MPosition[];
  readonly codes: readonly DirectionCode[];
  /** Greedy-reachable leg boundaries (indices into `tiles`); the mover clamps each chunk to the
   *  next one so every emitted dst is line-of-walk reachable. Absent → blind ≤12 slicing. */
  readonly waypoints?: readonly number[];
}

/**
 * Direction codes emitted into the canonical step buffer. Numpad layout:
 *
 * ```
 *   7 8 9      NW N NE
 *   4 . 6  ↔   W  ·  E
 *   1 2 3      SW S SE
 * ```
 *
 * Axes: +x → east, +y → north (WYD2 world convention).
 */
export type DirectionCode = 0x31 | 0x32 | 0x33 | 0x34 | 0x36 | 0x37 | 0x38 | 0x39;

export const DIR = {
  SW: 0x31,
  S: 0x32,
  SE: 0x33,
  W: 0x34,
  E: 0x36,
  NW: 0x37,
  N: 0x38,
  NE: 0x39,
} as const satisfies Record<string, DirectionCode>;

/**
 * Per-code tile delta (+x east, +y north) — the inverse of {@link DIR}. The single
 * source of the numpad code→tile mapping: the A* planner's neighbour scan
 * (`walkability-service.ts`) and `interpolateLeg` both read it, so stepping a code
 * list from its source reproduces the exact path tiles.
 */
export const DIR_DELTA: Record<DirectionCode, { x: number; y: number }> = {
  0x31: { x: -1, y: -1 }, // SW
  0x32: { x: 0, y: -1 }, // S
  0x33: { x: 1, y: -1 }, // SE
  0x34: { x: -1, y: 0 }, // W
  0x36: { x: 1, y: 0 }, // E
  0x37: { x: -1, y: 1 }, // NW
  0x38: { x: 0, y: 1 }, // N
  0x39: { x: 1, y: 1 }, // NE
};

/**
 * Metadata attached to every heightmap transfer so the renderer can validate
 * the buffer shape and skip refetches across hot-reloads.
 */
export interface HeightmapMeta {
  /** Always `WORLD_SIZE`. Carried explicitly so the renderer can assert. */
  width: number;
  /** Always `WORLD_SIZE`. */
  height: number;
  /** Short sha256 prefix of the heightmap bytes (produced by builder). */
  hash: string;
}

/**
 * Payload returned by `IPC.WALKABILITY_GET_HEIGHTMAP`. Buffer is a transferable
 * `ArrayBuffer` (no structured-clone copy when invoked via `ipcRenderer.invoke`).
 */
export interface HeightmapPayload {
  buffer: ArrayBuffer;
  meta: HeightmapMeta;
}
