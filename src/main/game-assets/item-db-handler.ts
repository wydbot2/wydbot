/**
 * IPC handler for the unified in-memory item database.
 *
 * Boot pipeline (eager via `warmItemDb` during boot, lazy on first IPC request):
 *   1. Read 6 game-data files via Promise.all (parallel I/O).
 *   2. Run each parser sequentially (CPU-bound, <100ms total).
 *   3. Build the unified ItemDb via the 8-step merge.
 *   4. Cache + return; subsequent IPC calls return the cached instance.
 *
 * The build READS the icon-cache manifest, so every entry point awaits
 * `iconCache.whenReady()` — building earlier would bake `hasIcon=false` into
 * the cached singleton (cold-boot race).
 *
 * Mirrors the pattern from `attribute-map-handler.ts`. The .bin/.dat files
 * are colocated with `AttributeMap.dat` under `getResourcePath()`.
 */

import { ipcMain } from 'electron';

import { IPC } from '@shared/ipc/ipc-channels';
import type { ItemDb } from '@shared/types/item-db-types';
import type { AssetFailure } from '@shared/types/asset-health-types';
import { getResourcePath, readFileOrNull } from '@main/lib';
import { secureEmptyInvoke } from '@main/ipc/secure-handler';

import type { IconCacheManager } from '../cache/icons';
import { assetsLogger } from '../logging';
import { buildItemDb } from './item-db-builder';
import { missingAssetFailure, toAssetFailure } from './parsers/asset-format-error';
import {
  parseExtraItemBin,
  parseItemListBin,
  parseItemhelpDat,
  parseItemnameBin,
  parseMountDataBin,
  parseMountDataVBin,
  parseSkillDataBin,
} from './parsers';

let cached: ItemDb | undefined;
let inflight: Promise<ItemDb> | undefined;

const readResource = (name: string): Promise<Buffer | null> =>
  readFileOrNull(getResourcePath(name));

/**
 * Parse one asset, funnelling ANY failure (missing file, format drift, decode
 * error) into `failures` and returning a caller-supplied empty fallback. This is
 * the "empty over garbage, never throw at load" boundary: one bad asset degrades
 * its own slice, never the whole load, and the failure is surfaced to the UI.
 */
const tryParse = <T>(
  asset: string,
  buf: Buffer | null,
  parse: (b: Buffer) => T,
  empty: T,
  failures: AssetFailure[],
): T => {
  if (buf === null) {
    failures.push(missingAssetFailure(asset));
    return empty;
  }
  try {
    return parse(buf);
  } catch (err) {
    const failure = toAssetFailure(asset, err);
    failures.push(failure);
    assetsLogger.error(
      `Asset parse failed: ${failure.asset} — ${failure.reason} (expected ${failure.expected}, got ${failure.actual})`,
    );
    return empty;
  }
};

const loadItemDb = async (iconCache: IconCacheManager): Promise<ItemDb> => {
  const startMs = Date.now();

  // Step 1: parallel I/O — 7 file reads + the icon cache manifest.
  const [bufList, bufExtra, bufName, bufHelp, bufMD, bufMDV, bufSkill, iconAvailableIds] =
    await Promise.all([
      readResource('ItemList.bin'),
      readResource('extraitem.bin'),
      readResource('itemname.bin'),
      readResource('itemhelp.dat'),
      readResource('MountData.bin'),
      readResource('MountDataV.bin'),
      readResource('SkillData.bin'),
      iconCache.getAvailableIconIds(),
    ]);
  const ioMs = Date.now() - startMs;

  // Step 2: parse each — failures are captured (never thrown), so the DB always builds.
  const parseStart = Date.now();
  const failures: AssetFailure[] = [];
  const itemListRows = tryParse('ItemList.bin', bufList, parseItemListBin, [], failures);
  const extraItemRecords = tryParse(
    'extraitem.bin',
    bufExtra,
    (b) => parseExtraItemBin(b).records,
    [],
    failures,
  );
  const nameMap = tryParse('itemname.bin', bufName, parseItemnameBin, new Map(), failures);
  const helpMap = tryParse('itemhelp.dat', bufHelp, parseItemhelpDat, new Map(), failures);
  const mountRows = tryParse('MountData.bin', bufMD, parseMountDataBin, [], failures);
  const mountVRows = tryParse('MountDataV.bin', bufMDV, parseMountDataVBin, [], failures);
  const skillRows = tryParse('SkillData.bin', bufSkill, parseSkillDataBin, [], failures);
  const parseMs = Date.now() - parseStart;

  // Step 3: merge whatever parsed cleanly.
  const mergeStart = Date.now();
  const db = buildItemDb({
    itemListRows,
    extraItemRecords,
    nameMap,
    helpMap,
    mountRows,
    mountVRows,
    skillRows,
    iconAvailableIds,
  });
  const mergeMs = Date.now() - mergeStart;

  if (failures.length > 0) {
    db.meta.degraded = { failures };
  }

  assetsLogger.info(
    `ItemDb loaded in ${Date.now() - startMs}ms ` +
      `(io=${ioMs}ms parse=${parseMs}ms merge=${mergeMs}ms): ` +
      `${db.meta.itemCount} items, ${db.meta.namedCount} named, ` +
      `${db.meta.helpCount} with help, ${db.meta.extraItemOverlayCount} overlays, ` +
      `${db.meta.skillViewCount} skill views` +
      (failures.length ? ` — DEGRADED: ${failures.map((f) => f.asset).join(', ')}` : ''),
  );

  return db;
};

/**
 * Builds (or returns) the cached ItemDb. Concurrent callers share one in-flight
 * build — the boot orchestrator warms it eagerly while a renderer IPC may arrive
 * at the same moment. Caller MUST await `iconCache.whenReady()` first.
 */
export const warmItemDb = (iconCache: IconCacheManager): Promise<ItemDb> => {
  if (cached) return Promise.resolve(cached);
  inflight ??= (async () => {
    const db = await loadItemDb(iconCache);
    cached = db;
    inflight = undefined;
    return db;
  })();
  return inflight;
};

/**
 * Drops the cached ItemDb so the next request rebuilds it. Called by the boot
 * orchestrator after the icon cache (re)initializes — a DB built against a
 * pre-rebuild manifest would carry stale `hasIcon` flags forever otherwise.
 */
export const invalidateItemDb = (): void => {
  cached = undefined;
  inflight = undefined;
};

export const registerItemDbHandler = (iconCache: IconCacheManager): void => {
  ipcMain.handle(
    IPC.DATA_GET_ITEM_DB,
    secureEmptyInvoke(async () => {
      await iconCache.whenReady();
      return warmItemDb(iconCache);
    }),
  );
};
