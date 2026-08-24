import * as fs from 'fs/promises';
import * as path from 'path';
import { getResourcePath } from '@main/lib';
import {
  parseObjectBin,
  MODEL_COUNT,
  MODEL_STRIDE,
  type ParsedObjectBin,
} from './parsers/object-bin-parser';
import { parseFieldDat, type DatObject } from './parsers/dat-parser';
import { assetsLogger } from '../logging';

/** Loads object.bin silhouettes + all Field*.dat placements into main-side memory for the heightmap bake. No IPC, no disk cache. */

const SECTORS_PER_AXIS = 32;
const MAX_PARSE_FAILURES = 10;
const OBJECT_BIN_PATH = getResourcePath('object.bin');
const MAPS_DIR = getResourcePath('maps');
/** Also used by the heightmap disk cache to enumerate derivation sources. */
export const DAT_FILENAME_RE = /^Field(\d{2})(\d{2})\.dat$/;
const EMPTY: readonly DatObject[] = [];

let objectBin: ParsedObjectBin | undefined;
let fieldObjects: Map<number, readonly DatObject[]> | undefined;
let cachedLoad: Promise<void> | undefined;

const sectorKey = (sectorX: number, sectorY: number): number =>
  sectorY * SECTORS_PER_AXIS + sectorX;
const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

interface DatSectorResult {
  readonly key: number;
  readonly objects: readonly DatObject[];
}

const loadDatSector = async (file: string): Promise<DatSectorResult | null> => {
  const match = DAT_FILENAME_RE.exec(file);
  if (!match) return null;
  const sectorX = Number(match[1]);
  const sectorY = Number(match[2]);

  if (sectorX >= SECTORS_PER_AXIS || sectorY >= SECTORS_PER_AXIS) {
    assetsLogger.warn(`Skipping ${file}: sector coords (${sectorX},${sectorY}) out of range`);
    return null;
  }

  const buf = await fs.readFile(path.join(MAPS_DIR, file));
  return { key: sectorKey(sectorX, sectorY), objects: parseFieldDat(buf) };
};

export const loadObjectData = async (): Promise<void> => {
  if (cachedLoad) return cachedLoad;

  cachedLoad = (async () => {
    const t0 = Date.now();

    let objBuf: Buffer;
    try {
      objBuf = await fs.readFile(OBJECT_BIN_PATH);
    } catch (err) {
      throw new Error(`Failed to read object.bin at ${OBJECT_BIN_PATH}: ${errMsg(err)}`);
    }
    objectBin = parseObjectBin(objBuf);

    let entries: string[];
    try {
      entries = await fs.readdir(MAPS_DIR);
    } catch (err) {
      throw new Error(`Failed to read maps directory at ${MAPS_DIR}: ${errMsg(err)}`);
    }

    const datFiles = entries.filter((f) => DAT_FILENAME_RE.test(f));
    const failures: string[] = [];
    const results = await Promise.all(
      datFiles.map(async (file) => {
        try {
          return await loadDatSector(file);
        } catch (err) {
          failures.push(`${file}: ${errMsg(err)}`);
          assetsLogger.warn(`Failed to parse ${file}: ${errMsg(err)}`);
          return null;
        }
      }),
    );

    if (failures.length > MAX_PARSE_FAILURES) {
      throw new Error(
        `Aborting object-data load: ${failures.length} .dat files failed to parse ` +
          `(threshold ${MAX_PARSE_FAILURES}). First failures: ${failures.slice(0, 5).join('; ')}`,
      );
    }

    const map = new Map<number, readonly DatObject[]>();
    let objectCount = 0;
    for (const result of results) {
      if (!result) continue;
      map.set(result.key, result.objects);
      objectCount += result.objects.length;
    }
    fieldObjects = map;

    assetsLogger.info(
      `Object data loaded: ${objectBin.modelCount} model silhouettes, ${map.size} sectors, ` +
        `${objectCount} placed objects, elapsed=${Date.now() - t0}ms`,
    );
  })();

  try {
    await cachedLoad;
  } catch (err) {
    cachedLoad = undefined;
    throw err;
  }
};

/** The 16×16 silhouette grid (256 bytes) for `modelId`, or null if out of range. Throws before {@link loadObjectData} resolves. */
export const getObjectSilhouette = (modelId: number): Uint8Array | null => {
  if (!objectBin) throw new Error('getObjectSilhouette() called before loadObjectData() resolved');
  if (!Number.isInteger(modelId) || modelId < 0 || modelId >= MODEL_COUNT) return null;
  const start = modelId * MODEL_STRIDE;
  return objectBin.silhouettes.subarray(start, start + MODEL_STRIDE);
};

/** Placed objects in sector (sectorX, sectorY); empty if absent. Throws before {@link loadObjectData} resolves. */
export const getFieldObjects = (sectorX: number, sectorY: number): readonly DatObject[] => {
  if (!fieldObjects) throw new Error('getFieldObjects() called before loadObjectData() resolved');
  return fieldObjects.get(sectorKey(sectorX, sectorY)) ?? EMPTY;
};
