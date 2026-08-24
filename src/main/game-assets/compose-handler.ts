/**
 * IPC handler for the composition (Item-Mix) menu catalog.
 *
 * Boot pipeline (lazy on first request), mirroring `item-db-handler.ts`:
 *   1. Read Missionitems.bin + missionhelp.dat from the asset store.
 *   2. Parse each (pure parsers).
 *   3. Build the grouped catalog (per-NPC root tree, missionhelp labels, item IDs).
 *   4. Cache + return.
 *
 * Item NAMES are NOT resolved here — nodes carry item IDs and the renderer resolves
 * names via the item-db (single source of truth). So this path never reads itemname.bin.
 *
 * These files reach the store via the asset allowlist (`asset-allowlist.ts`); the
 * full Missionitems table arrives through the launcher's version patches.
 */

import * as fs from 'fs/promises';
import { ipcMain } from 'electron';

import { IPC } from '@shared/ipc/ipc-channels';
import type { ComposeCatalog } from '@shared/types/compose-types';
import { getResourcePath } from '@main/lib';
import { assetsReady } from '@main/asset-update/asset-ready';
import { secureEmptyInvoke } from '@main/ipc/secure-handler';

import { assetsLogger } from '../logging';
import { parseMissionitemsBin, parseMissionhelpDat } from './parsers';
import { buildComposeCatalog } from './compose-catalog-builder';

let cached: ComposeCatalog | undefined;

const readResource = async (name: string): Promise<Buffer> => {
  const filePath = getResourcePath(name);
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    throw new Error(
      `Failed to read ${name} at ${filePath}: ${err instanceof Error ? err.message : err}`,
    );
  }
};

const loadComposeCatalog = async (): Promise<ComposeCatalog> => {
  const startMs = Date.now();
  const [missionBuf, helpBuf] = await Promise.all([
    readResource('Missionitems.bin'),
    readResource('missionhelp.dat'),
  ]);

  const stats = { recordsScanned: 0, recipes: 0 };
  const recipes = parseMissionitemsBin(missionBuf, stats);
  const helpMap = parseMissionhelpDat(helpBuf);

  const catalog = buildComposeCatalog({ recipes, nodeName: (rowid) => helpMap.get(rowid) });

  assetsLogger.info(
    `ComposeCatalog loaded in ${Date.now() - startMs}ms: ${catalog.recipeCount} recipes, ` +
      `${catalog.root.children.length} root groups (from ${stats.recordsScanned} records)`,
  );
  return catalog;
};

export const registerComposeHandler = (): void => {
  ipcMain.handle(
    IPC.DATA_GET_COMPOSE_CATALOG,
    secureEmptyInvoke(async () => {
      if (cached) return cached;
      await assetsReady();
      cached = await loadComposeCatalog();
      return cached;
    }),
  );
};
