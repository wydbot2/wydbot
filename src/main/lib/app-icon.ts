import { existsSync } from 'fs';
import { join } from 'path';
import { app, nativeImage, type NativeImage } from 'electron';

/** Matches `build.appId` — process AUMID and per-window `setAppDetails` must agree. */
export const APP_USER_MODEL_ID = 'com.wydbot.electron';

/**
 * Ordered absolute paths to try for the BrowserWindow / taskbar icon.
 * PNG first (Electron `nativeImage` baseline on every platform), then ICO.
 * Packaged: `extraResources` next to asar. Dev: repo `build/`.
 */
export const windowIconPathCandidates = (opts: {
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  moduleDir: string;
}): string[] => {
  const dirs = opts.isPackaged
    ? [opts.resourcesPath]
    : [join(opts.moduleDir, '..', '..', 'build'), join(opts.appPath, 'build')];

  const out: string[] = [];
  for (const name of ['icon.png', 'icon.ico'] as const) {
    for (const dir of dirs) {
      out.push(join(dir, name));
    }
  }
  return out;
};

/** First existing candidate path (png before ico). Pure enough for unit tests. */
export const pickExistingIconPath = (
  candidates: readonly string[],
  exists: (path: string) => boolean = existsSync,
): string | undefined => {
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return undefined;
};

const liveCandidates = (): string[] =>
  windowIconPathCandidates({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    moduleDir: __dirname,
  });

/**
 * Path-only resolve (no decode). Prefer `resolveWindowIcon()` for BrowserWindow —
 * a path that exists can still fail to load (empty NativeImage).
 */
export const resolveWindowIconPath = (): string | undefined =>
  pickExistingIconPath(liveCandidates());

/**
 * Validated icon for `BrowserWindow({ icon })` / taskbar while running.
 * Skips paths that `nativeImage` cannot decode (empty image → Electron default atom).
 */
export const resolveWindowIcon = (): NativeImage | undefined => {
  for (const candidate of liveCandidates()) {
    if (!existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return undefined;
};

/**
 * Relaunch / pin icon for `setAppDetails` on packaged Windows.
 * Uses the PE (`process.execPath`) — same resource Explorer already paints correctly.
 */
export const resolveRelaunchIconPath = (): string | undefined => {
  if (process.platform !== 'win32' || !app.isPackaged) return undefined;
  return process.execPath;
};

/**
 * @deprecated Prefer `resolveWindowIcon()` (validated) or `resolveWindowIconPath()`.
 * Kept as a path-only alias of the first existing candidate.
 */
export const resolveAppIconPath = (): string | undefined => resolveWindowIconPath();
