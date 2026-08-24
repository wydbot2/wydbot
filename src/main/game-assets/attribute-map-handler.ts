/** AttributeMap.dat loader — RAW 1024×1024 grid (1 cell = 4×4 tiles). Wall bake + zone-portal gate. */

import * as fs from 'fs/promises';
import { getResourcePath } from '@main/lib';
import { assetsLogger } from '../logging';

const EXPECTED_SIZE = 1024 * 1024;
const ATTR_GRID = 1024;
const ATTR_BIT_ZONE_PORTAL = 0x10 as const;
const FILE_PATH = getResourcePath('AttributeMap.dat');

let cached: Buffer | undefined;

/** Loads (and caches) AttributeMap.dat as a tight 1 MiB Buffer. */
export const loadAttributeMap = async (): Promise<Buffer> => {
  if (cached) return cached;

  let buf: Buffer;
  try {
    buf = await fs.readFile(FILE_PATH);
  } catch (err) {
    throw new Error(
      `Failed to read AttributeMap.dat at ${FILE_PATH}: ${err instanceof Error ? err.message : err}`,
    );
  }

  if (buf.length < EXPECTED_SIZE) {
    throw new Error(
      `AttributeMap.dat is truncated: expected ${EXPECTED_SIZE} bytes, got ${buf.length}`,
    );
  }
  if (buf.length > EXPECTED_SIZE) {
    assetsLogger.warn(
      `AttributeMap file larger than expected: ${buf.length} bytes (expected ${EXPECTED_SIZE})`,
    );
  }

  cached = buf.subarray(0, EXPECTED_SIZE) as Buffer;
  assetsLogger.info(`AttributeMap loaded (${cached.length} bytes)`);
  return cached;
};

export const isZonePortalAttrAt = (attr: Buffer, worldX: number, worldY: number): boolean => {
  const ix = (worldX >> 2) & (ATTR_GRID - 1);
  const iy = (worldY >> 2) & (ATTR_GRID - 1);
  return (attr[ix + iy * ATTR_GRID]! & ATTR_BIT_ZONE_PORTAL) !== 0;
};

/** Fail-closed if AttributeMap cache is unloaded. */
export const isZonePortalTile = (worldX: number, worldY: number): boolean => {
  if (!cached) return false;
  return isZonePortalAttrAt(cached, worldX, worldY);
};
