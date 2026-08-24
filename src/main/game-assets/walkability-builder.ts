import * as fs from 'fs/promises';
import * as path from 'path';
import { fingerprintBufferSha256, getResourcePath } from '@main/lib';
import {
  heightmapCacheDir,
  readHeightmapCache,
  writeHeightmapCache,
  type HeightmapSourceFile,
} from '@main/cache/heightmap';
import { parseTrn } from './parsers/trn-parser';
import {
  loadObjectData,
  getFieldObjects,
  getObjectSilhouette,
  DAT_FILENAME_RE,
} from './object-data-loader';
import { loadAttributeMap } from './attribute-map-handler';
import { bakeObjectSilhouettes, bakeAttributeMapWalls } from './heightmap-bake';
import { assetsLogger } from '../logging';

/**
 * Builds the global 4096×4096 i8 world heightmap from all `Field*.trn` sectors, then
 * bakes wall heights (`object.bin` silhouettes + AttributeMap `0x02`) so the
 * heightmap-only pathfinder contours buildings.
 *
 * Coordinate convention (per PHASE-1-PLAN §0, §6.4):
 *   world tile (wx, wy) ∈ [0, 4096) → index `wy * 4096 + wx`.
 *   sector (sx, sy) ∈ [0, 32)       → world region `[sx*128 .. sx*128+128) × [sy*128 .. sy*128+128)`.
 *   disk cell (cx, cy) ∈ [0, 64)    → 2×2 patch at `[sx*128 + cx*2 .. +2) × [sy*128 + cy*2 .. +2)`.
 *
 * Missing sectors (out of the 1024 = 32×32 grid, only ~124 .trn exist on disk)
 * are filled with `0x7F` — the canonical loader's missing-neighbour sentinel
 * any path entering an uncharted sector automatically.
 *
 * Performance budget (one-shot, at boot):
 *   - 124 parallel file reads: <= 200 ms on a fast disk.
 *   - 16 MB Int8Array allocation: <= 5 ms.
 *   - Per-cell expansion (124 * 64 * 64 * 4 = ~2 M writes): <= 20 ms.
 *   - Total <= 250 ms; runs once and is cached module-level.
 *   - Steady-state boots skip all of the above via the disk cache in
 *     `@main/cache/heightmap` (manifest + 16 MB blob under userData); only a
 *     real source change (asset-update touching the inputs) pays a full build.
 */

const WORLD_TILES = 4096; // 32 sectors x 128 tiles/sector
const HEIGHTMAP_SIZE = WORLD_TILES * WORLD_TILES; // 16,777,216 bytes
const SECTORS_PER_AXIS = 32;
const SECTOR_TILES = 128;
const TRN_CELLS_PER_AXIS = 64;
const MAX_PARSE_FAILURES = 10;
const MAPS_DIR = getResourcePath('maps');
const OBJECT_BIN_PATH = getResourcePath('object.bin');
const ATTRIBUTE_MAP_PATH = getResourcePath('AttributeMap.dat');
const TRN_FILENAME_RE = /^Field(\d{2})(\d{2})\.trn$/;

let cachedBuild: Promise<Readonly<Int8Array>> | undefined;
let cachedHash: string | undefined;

/**
 * The exact file set the heightmap derives from, as stable-keyed fingerprint
 * sources for the disk cache. Sorted keys → deterministic manifests.
 */
const discoverHeightmapSources = (entries: readonly string[]): HeightmapSourceFile[] => {
  const sources: HeightmapSourceFile[] = [];
  const trnFiles = entries.filter((f) => TRN_FILENAME_RE.test(f)).sort();
  const datFiles = entries.filter((f) => DAT_FILENAME_RE.test(f)).sort();
  for (const f of trnFiles) sources.push({ key: `maps/${f}`, path: path.join(MAPS_DIR, f) });
  for (const f of datFiles) sources.push({ key: `maps/${f}`, path: path.join(MAPS_DIR, f) });
  sources.push({ key: 'object.bin', path: OBJECT_BIN_PATH });
  sources.push({ key: 'AttributeMap.dat', path: ATTRIBUTE_MAP_PATH });
  return sources;
};

interface SectorLoadResult {
  readonly sectorX: number;
  readonly sectorY: number;
  readonly heights: Int8Array;
}

const loadSector = async (file: string): Promise<SectorLoadResult | null> => {
  const match = TRN_FILENAME_RE.exec(file);
  if (!match) return null;
  const sectorX = Number(match[1]);
  const sectorY = Number(match[2]);

  if (
    !Number.isInteger(sectorX) ||
    !Number.isInteger(sectorY) ||
    sectorX < 0 ||
    sectorX >= SECTORS_PER_AXIS ||
    sectorY < 0 ||
    sectorY >= SECTORS_PER_AXIS
  ) {
    assetsLogger.warn(`Skipping ${file}: sector coords (${sectorX},${sectorY}) out of range`);
    return null;
  }

  const buf = await fs.readFile(path.join(MAPS_DIR, file));
  const parsed = parseTrn(buf);
  return { sectorX, sectorY, heights: parsed.heights };
};

const stampSector = (world: Int8Array, sector: SectorLoadResult): void => {
  const { sectorX, sectorY, heights } = sector;
  const baseX = sectorX * SECTOR_TILES;
  const baseY = sectorY * SECTOR_TILES;

  for (let cy = 0; cy < TRN_CELLS_PER_AXIS; cy++) {
    const wy0 = baseY + cy * 2;
    const wy1 = wy0 + 1;
    const row0Off = wy0 * WORLD_TILES + baseX;
    const row1Off = wy1 * WORLD_TILES + baseX;
    const cellRow = cy * TRN_CELLS_PER_AXIS;
    for (let cx = 0; cx < TRN_CELLS_PER_AXIS; cx++) {
      const h = heights[cellRow + cx];
      const wx = cx * 2;
      world[row0Off + wx] = h;
      world[row0Off + wx + 1] = h;
      world[row1Off + wx] = h;
      world[row1Off + wx + 1] = h;
    }
  }
};

/**
 * Build the global heightmap. Idempotent: subsequent calls return the cached
 * promise. Throws only if more than {@link MAX_PARSE_FAILURES} files fail.
 */
export const buildWorldHeightmap = (): Promise<Readonly<Int8Array>> => {
  if (cachedBuild) return cachedBuild;

  cachedBuild = (async () => {
    const t0 = Date.now();

    let entries: string[];
    try {
      entries = await fs.readdir(MAPS_DIR);
    } catch (err) {
      throw new Error(
        `Failed to read maps directory at ${MAPS_DIR}: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Disk cache: the derivation inputs (trn + dat + object.bin + AttributeMap)
    // only change via asset-update, so steady-state boots serve the persisted
    // 16 MB blob in ~100 ms instead of re-reading/baking every source.
    const cacheDir = heightmapCacheDir();
    const sources = discoverHeightmapSources(entries);
    try {
      const hit = await readHeightmapCache(cacheDir, sources);
      if (hit) {
        // Cache-hit still must populate attribute-map-handler's module-level
        // `cached` buffer. The cold path does this implicitly via
        // bakeAttributeMapWalls(world, await loadAttributeMap()) below; without
        // this call here, `isZonePortalTile()` in attribute-map-handler.ts stays
        // fail-closed (returns false for every tile) and the 0x290 zone-portal
        // gate in command-sender.ts rejects every useZonePortal().
        await loadAttributeMap();
        cachedHash = hit.hash;
        return hit.world as Readonly<Int8Array>;
      }
    } catch (err) {
      assetsLogger.warn(
        `World heightmap cache read failed — rebuilding (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    const world = new Int8Array(HEIGHTMAP_SIZE);
    // 0x7F = canonical missing-neighbour sentinel (PHASE-1-PLAN §2.3).
    // The ±8 slope test rejects any step into such a cell.
    world.fill(0x7f);

    const trnFiles = entries.filter((f) => TRN_FILENAME_RE.test(f));

    let loadedCount = 0;
    let failureCount = 0;
    const failures: string[] = [];

    const results = await Promise.all(
      trnFiles.map(async (file) => {
        try {
          return await loadSector(file);
        } catch (err) {
          failureCount += 1;
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`${file}: ${msg}`);
          assetsLogger.warn(`Failed to parse ${file}: ${msg}`);
          return null;
        }
      }),
    );

    if (failureCount > MAX_PARSE_FAILURES) {
      throw new Error(
        `Aborting heightmap build: ${failureCount} .trn files failed to parse ` +
          `(threshold ${MAX_PARSE_FAILURES}). Likely a corrupted install. ` +
          `First failures: ${failures.slice(0, 5).join('; ')}`,
      );
    }

    for (const result of results) {
      if (!result) continue;
      stampSector(world, result);
      loadedCount += 1;
    }

    // Bake walls into the same plane so the ±8 pathfinder contours buildings.
    await loadObjectData();
    const objWalls = bakeObjectSilhouettes(world, getFieldObjects, getObjectSilhouette);
    const attrWalls = bakeAttributeMapWalls(world, await loadAttributeMap());

    const totalSectors = SECTORS_PER_AXIS * SECTORS_PER_AXIS;
    const missingCount = totalSectors - loadedCount;

    const hash = fingerprintBufferSha256(
      Buffer.from(world.buffer, world.byteOffset, world.byteLength),
    ).slice(0, 16);
    cachedHash = hash;

    const elapsedMs = Date.now() - t0;
    assetsLogger.info(
      `World heightmap built: ${loadedCount} sectors loaded, ` +
        `${missingCount} missing (filled 0x7F), walls baked (object=${objWalls}, attr0x02=${attrWalls}), ` +
        `${world.byteLength} bytes, hash=${hash}, elapsed=${elapsedMs}ms`,
    );

    try {
      await writeHeightmapCache(cacheDir, world, sources, {
        buildMs: elapsedMs,
        sectorsLoaded: loadedCount,
        objectWalls: objWalls,
        attrWalls,
      });
    } catch (err) {
      // The cache is a boot-time optimization only — never fail the build over it.
      assetsLogger.warn(
        `World heightmap cache write failed (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    // V8 refuses Object.freeze on TypedArray with elements (indexed props are
    // non-configurable). Type-level Readonly<Int8Array> provides the immutability
    // contract for consumers.
    return world as Readonly<Int8Array>;
  })();

  return cachedBuild;
};

/**
 * SHA-256 (first 16 hex chars) of the built heightmap. Available only after
 * {@link buildWorldHeightmap} has resolved. Used for IPC version-tracking.
 */
export const getHeightmapHash = (): string => {
  if (!cachedHash) {
    throw new Error('getHeightmapHash() called before buildWorldHeightmap() resolved');
  }
  return cachedHash;
};
