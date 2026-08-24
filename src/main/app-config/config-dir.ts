import { basename, join } from 'path';
import { access, mkdir, readdir, rename, rmdir } from 'fs/promises';
import { app } from 'electron';
import { getStableFingerprint } from '@main/platform';
import { planLegacyMigration } from './config-paths';
import { assetsLogger } from '../logging';

// Per-machine config folder ~/Documents/w-<fingerprint>, keyed on the stable machine GUID so a network/adapter change never moves it.
export const getConfigDir = async (): Promise<string> =>
  join(app.getPath('documents'), `w-${await getStableFingerprint()}`);

const pathExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

// Moves *.json from stale `w-*` folders into `currentDir`. Best-effort: never overwrites, never fatal.
const migrateLegacyConfigDirs = async (currentDir: string): Promise<void> => {
  try {
    const documents = app.getPath('documents');
    const entries = await readdir(documents, { withFileTypes: true });
    const legacy = planLegacyMigration(
      entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() })),
      basename(currentDir),
    );
    for (const dirName of legacy) {
      const dir = join(documents, dirName);
      try {
        const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'));
        for (const file of files) {
          const dest = join(currentDir, file);
          if (await pathExists(dest)) {
            assetsLogger.warn(`Config migration skipped (name exists): ${file}`);
            continue;
          }
          await rename(join(dir, file), dest);
        }
        try {
          await rmdir(dir);
        } catch {
          // legacy dir not empty or locked — leave it
        }
      } catch (err) {
        assetsLogger.warn(`Config migration failed for ${dirName}: ${String(err)}`);
      }
    }
  } catch (err) {
    assetsLogger.warn(`Config migration scan failed: ${String(err)}`);
  }
};

// Creates the config folder (idempotent), consolidates legacy folders, returns its path. Called once at boot.
export const ensureConfigDir = async (): Promise<string> => {
  const dir = await getConfigDir();
  await mkdir(dir, { recursive: true });
  await migrateLegacyConfigDirs(dir);
  return dir;
};
