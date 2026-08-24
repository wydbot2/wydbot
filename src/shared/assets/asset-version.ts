/**
 * Pure version/decision helpers for the game-asset updater. The local asset
 * version is an integer stored in the store's `state.json`; the remote version
 * is the manifest's integer patch level (`games.Global.version`).
 */

export type AssetUpdateAction = 'up-to-date' | 'bootstrap' | 'patch';

/**
 * Decide what the boot gate must do.
 * - `bootstrap`: cold start — no/incomplete store ⇒ download base zip + all patches.
 * - `patch`: warm — store complete but behind ⇒ apply patches localVersion+1..remote.
 * - `up-to-date`: store complete and current ⇒ proceed without downloading.
 */
export const decideAssetAction = (
  localVersion: number,
  remoteVersion: number,
  storeComplete: boolean,
): AssetUpdateAction => {
  if (!storeComplete || localVersion <= 0) return 'bootstrap';
  if (remoteVersion > localVersion) return 'patch';
  return 'up-to-date';
};

/** Patch zip URL for version N: `${base}${n}.zip`. */
export const patchUrl = (patchBaseUrl: string, n: number): string => `${patchBaseUrl}${n}.zip`;

/**
 * Inclusive patch versions to apply for a warm update: localVersion+1 .. remoteVersion.
 * Empty when already current. (A 404 on the top version is handled at fetch time —
 * the manifest can advertise a version before its patch zip is published.)
 */
export const patchRange = (localVersion: number, remoteVersion: number): number[] => {
  const out: number[] = [];
  for (let n = Math.max(1, localVersion + 1); n <= remoteVersion; n++) out.push(n);
  return out;
};
