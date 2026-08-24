import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';
import { REQUIRED_ASSET_DESTS } from '@shared/assets/asset-allowlist';
import {
  ProtocolCompatibilitySchema,
  type ProtocolCompatibility,
} from '@shared/protocol/protocol-compatibility';

/** Bump to abandon an old store layout (e.g. allowlist remap) and force a clean re-bootstrap. */
export const ASSET_SCHEMA_VERSION = 1;

const AssetStateSchema = z
  .object({
    schemaVersion: z.number().int(),
    assetVersion: z.number().int().nonnegative(),
    protocolCompatibility: ProtocolCompatibilitySchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.protocolCompatibility &&
      value.protocolCompatibility.assetVersion !== value.assetVersion
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['protocolCompatibility', 'assetVersion'],
        message: 'protocol compatibility does not match assetVersion',
      });
    }
  });

export type AssetState = z.infer<typeof AssetStateSchema>;

/** The live store: `<userData>/game-assets/v<SCHEMA>` — the sole asset source in prod. */
export const assetStoreRoot = (): string =>
  join(app.getPath('userData'), 'game-assets', `v${ASSET_SCHEMA_VERSION}`);

const statePath = (root: string): string => join(root, 'state.json');

export const readAssetState = async (root: string): Promise<AssetState | null> => {
  try {
    const parsed = AssetStateSchema.parse(JSON.parse(await readFile(statePath(root), 'utf8')));
    return parsed.schemaVersion === ASSET_SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
};

export const writeAssetState = async (
  root: string,
  assetVersion: number,
  protocolCompatibility: ProtocolCompatibility,
): Promise<void> => {
  await mkdir(root, { recursive: true });
  if (protocolCompatibility.assetVersion !== assetVersion) {
    throw new Error('protocol compatibility assetVersion does not match asset state');
  }
  const state: AssetState = {
    schemaVersion: ASSET_SCHEMA_VERSION,
    assetVersion,
    protocolCompatibility,
  };
  const path = statePath(root);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2), {
    encoding: 'utf8',
    flush: true,
  });
  await rename(temporaryPath, path);
};

/** Local asset version (0 if absent/unreadable ⇒ cold start). */
export const localAssetVersion = async (root: string): Promise<number> =>
  (await readAssetState(root))?.assetVersion ?? 0;

const exists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const dirHasFiles = async (dir: string): Promise<boolean> => {
  try {
    return (await readdir(dir)).length > 0;
  } catch {
    return false;
  }
};

/**
 * True iff every REQUIRED allowlist dest is present AND the cache source dirs
 * (`Icons/` for the icon atlases, `maps/` for map/heightmap atlases) are populated.
 * The dir checks catch an allowlist gap that would otherwise crash a cache at boot.
 */
export const isStoreComplete = async (root: string): Promise<boolean> => {
  const [files, icons, maps] = await Promise.all([
    Promise.all(REQUIRED_ASSET_DESTS.map((dest) => exists(join(root, dest)))),
    dirHasFiles(join(root, 'Icons')),
    dirHasFiles(join(root, 'maps')),
  ]);
  return files.every(Boolean) && icons && maps;
};

/**
 * Crash-safe promote of `stagingDir` → `root`. Moves the current store aside to
 * `root.bak` FIRST, then renames staging into place, then drops the backup — so
 * at every instant either the old store (`root` or `root.bak`) survives. If a
 * prior promote was interrupted (root missing, backup present), it self-heals by
 * restoring the backup before proceeding. Never `rm`s the live store outright.
 */
export const promoteStaging = async (stagingDir: string, root: string): Promise<void> => {
  await mkdir(dirname(root), { recursive: true });
  const backup = `${root}.bak`;

  // Recover an interrupted prior promote.
  if (!(await exists(root)) && (await exists(backup))) {
    await rename(backup, root);
  }
  await rm(backup, { recursive: true, force: true });

  if (await exists(root)) await rename(root, backup);
  await rename(stagingDir, root);
  await rm(backup, { recursive: true, force: true });
};
