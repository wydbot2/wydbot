/**
 * Bakes wall data into the world heightmap so the heightmap-only pathfinder
 * (±8 rule) contours buildings — the single source of truth. Mirrors the
 *
 * Canonical wall sources are exactly these two (plus the .trn terrain itself and
 * (generic-object path only — TMLeaf `0x137-0x142` never bakes) and AttributeMap
 */

import { WORLD_SIZE, BLOCKED_SENTINEL } from '@shared/ipc/walkability';
import type { DatObject } from './parsers/dat-parser';

const SECTORS_PER_AXIS = 32;
const SECTOR_TILES = 128;
const MODEL_DIM = 16;
const MODEL_CENTER = (MODEL_DIM - 1) / 2; // 7.5
const ATTR_GRID = WORLD_SIZE >> 2; // 1024 (1 cell = 4×4 tiles)
const ATTR_CELL_TILES = 4;
const ATTR_WALL_BIT = 0x02;
const TMLEAF_TYPE_MIN = 0x137;
const TMLEAF_TYPE_MAX = 0x142;
const MODEL_PIVOT = MODEL_DIM / 2 - 1;

export const bakeAttributeMapWalls = (world: Int8Array, attr: Buffer): number => {
  let stamped = 0;
  for (let cellY = 0; cellY < ATTR_GRID; cellY++) {
    for (let cellX = 0; cellX < ATTR_GRID; cellX++) {
      if ((attr[cellX + cellY * ATTR_GRID] & ATTR_WALL_BIT) === 0) continue;
      const baseX = cellX * ATTR_CELL_TILES;
      for (let dy = 0; dy < ATTR_CELL_TILES; dy++) {
        const row = (cellY * ATTR_CELL_TILES + dy) * WORLD_SIZE;
        for (let dx = 0; dx < ATTR_CELL_TILES; dx++) {
          world[row + baseX + dx] = BLOCKED_SENTINEL;
          stamped++;
        }
      }
    }
  }
  return stamped;
};

/**
 * MAX-stamps each placed object's `object.bin` silhouette height into the
 * are render-only and skipped. The building interior bakes as its real low
 * (walkable) floor — entry is through the silhouette's door, not a solid block.
 *
 * (FPU-traced): `low=trunc(cos·u−sin·v+7.5)`, `high=trunc(sin·u+cos·v+7.5)`,
 * `u=dc−7, v=dr−7`; cell = `silhouette[high·16+low]` (signed). Wrong handedness
 * (reflection / swapped low·high) mirrors the house and baked real walls as open.
 * Height = `min(trunc(3·cell + z/0.1) + (z>0?1:0), 0x7f)`, MAX-stamped.
 */
export const bakeObjectSilhouettes = (
  world: Int8Array,
  getFieldObjects: (sectorX: number, sectorY: number) => readonly DatObject[],
  getObjectSilhouette: (modelId: number) => Uint8Array | null,
): number => {
  let stamped = 0;
  for (let sy = 0; sy < SECTORS_PER_AXIS; sy++) {
    for (let sx = 0; sx < SECTORS_PER_AXIS; sx++) {
      const objects = getFieldObjects(sx, sy);
      if (objects.length === 0) continue;
      const originX = sx * SECTOR_TILES;
      const originY = sy * SECTOR_TILES;

      for (const obj of objects) {
        if (obj.type >= TMLEAF_TYPE_MIN && obj.type <= TMLEAF_TYPE_MAX) continue;
        const silhouette = getObjectSilhouette(obj.modelId);
        if (!silhouette) continue;

        const cx = originX + (Math.trunc(obj.x) & 0x7f);
        const cy = originY + (Math.trunc(obj.y) & 0x7f);
        const angle = Math.PI + obj.rot;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const zBias = obj.z / 0.1; // canonical FDIV by 0.1 (≡ z·10)
        const zRound = obj.z > 0 ? 1 : 0;

        for (let dr = 0; dr < MODEL_DIM; dr++) {
          for (let dc = 0; dc < MODEL_DIM; dc++) {
            const u = dc - MODEL_PIVOT;
            const v = dr - MODEL_PIVOT;
            const low = Math.trunc(cos * u - sin * v + MODEL_CENTER); // ×1 index
            const high = Math.trunc(sin * u + cos * v + MODEL_CENTER); // ×16 index
            if (low < 0 || low >= MODEL_DIM || high < 0 || high >= MODEL_DIM) continue;
            const raw = silhouette[high * MODEL_DIM + low];
            if (raw === 0) continue;
            const cell = (raw << 24) >> 24; // canonical MOVSX (signed byte)

            const h = Math.min(Math.trunc(3 * cell + zBias) + zRound, BLOCKED_SENTINEL);
            const wx = cx - MODEL_PIVOT + dc;
            const wy = cy - MODEL_PIVOT + dr;
            if (wx < 0 || wx >= WORLD_SIZE || wy < 0 || wy >= WORLD_SIZE) continue;
            const idx = wy * WORLD_SIZE + wx;
            if (h > world[idx]) {
              world[idx] = h;
              stamped++;
            }
          }
        }
      }
    }
  }
  return stamped;
};
