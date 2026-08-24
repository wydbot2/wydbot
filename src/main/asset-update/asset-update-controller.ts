import { join } from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import { app, net } from 'electron';
import { ASSET_REQUEST_HEADERS } from '@shared/constants/asset-cdn';
import { decideAssetAction, patchRange, patchUrl, type GameAssetSource } from '@shared/assets';
import type { ProtocolCompatibility } from '@shared/protocol/protocol-compatibility';
import type { AssetFailure } from '@shared/types/asset-health-types';
import { validateBootCriticalAssets } from '@main/game-assets/validate-assets';
import { readFileOrNull } from '@main/lib';
import {
  beginProtocolCompatibilityCheck,
  blockProtocolCompatibility,
  ProtocolCompatibilityError,
  resolveProtocolCompatibility,
  setProtocolCompatibility,
  type VersionedClientBinaryObservation,
} from '@main/protocol/protocol-compatibility';
import { fetchGameAssetSource } from './raid-manifest';
import { extractAllowlistedZip, type ExtractResult } from './zip-stream-extract';
import {
  assetStoreRoot,
  isStoreComplete,
  localAssetVersion,
  promoteStaging,
  readAssetState,
  writeAssetState,
} from './asset-store';

export type GateResult = 'proceed' | 'blocked' | 'protocol-incompatible';
export type AssetStage = 'assets-checking' | 'assets-downloading' | 'assets-extracting';

/** Thrown by `openZipStream` for a 404 — a patch version not yet published. */
export class MissingPatchError extends Error {
  constructor(public readonly url: string) {
    super(`patch not found (404): ${url}`);
    this.name = 'MissingPatchError';
  }
}

export interface AssetUpdateDeps {
  readonly storeRoot: string;
  readonly stagingRoot: string;
  fetchSource: () => Promise<GameAssetSource>;
  localVersion: (root: string) => Promise<number>;
  storeComplete: (root: string) => Promise<boolean>;
  openZipStream: (url: string) => Promise<AsyncIterable<Uint8Array>>;
  extract: (chunks: AsyncIterable<Uint8Array>, destRoot: string) => Promise<ExtractResult>;
  writeVersion: (
    root: string,
    version: number,
    protocolCompatibility: ProtocolCompatibility,
  ) => Promise<void>;
  promote: (stagingDir: string, root: string) => Promise<void>;
  resetDir: (dir: string) => Promise<void>;
  /** Clean `stagingRoot`, then copy the live store into it (warm patches stage a copy). */
  copyStore: (root: string, stagingDir: string) => Promise<void>;
  /** Dry-parse the boot-critical assets under `root`; empty ⇒ all parseable. */
  validate: (root: string) => Promise<AssetFailure[]>;
  isMissingPatch: (err: unknown) => boolean;
  /** Required because omitting it would silently turn a protocol update into fail-open. */
  protocol: {
    beginCheck: () => void;
    block: () => void;
    read: (root: string) => Promise<ProtocolCompatibility | null>;
    resolve: (input: {
      assetVersion: number;
      previous?: ProtocolCompatibility | null;
      observations: readonly VersionedClientBinaryObservation[];
    }) => ProtocolCompatibility;
    install: (value: ProtocolCompatibility) => void;
  };
  onProgress?: (stage: AssetStage) => void;
  logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

interface PatchApplication {
  readonly applied: number;
  readonly observations: VersionedClientBinaryObservation[];
}

const versionObservations = (
  result: ExtractResult,
  patchVersion: number,
): VersionedClientBinaryObservation[] =>
  result.clientBinaries.map((observation) => ({ ...observation, patchVersion }));

/**
 * Apply patch zips fromVersion+1..to over `destRoot`, stream-filtered to the allowlist.
 * Returns the highest version successfully applied. A 404 on the TOP version is
 * tolerated (the manifest can advertise a version before its zip is published);
 * a 404 below the top is a hard gap and re-throws.
 */
const applyPatches = async (
  deps: AssetUpdateDeps,
  src: GameAssetSource,
  fromVersion: number,
  to: number,
  destRoot: string,
): Promise<PatchApplication> => {
  let applied = fromVersion;
  const observations: VersionedClientBinaryObservation[] = [];
  for (const n of patchRange(fromVersion, to)) {
    const url = patchUrl(src.patchBaseUrl, n);
    try {
      const result = await deps.extract(await deps.openZipStream(url), destRoot);
      observations.push(...versionObservations(result, n));
    } catch (err) {
      if (deps.isMissingPatch(err) && n === to) {
        deps.logger?.warn(`asset patch ${n} not published yet — stopping at ${applied}`);
        break;
      }
      throw err;
    }
    applied = n;
  }
  return { applied, observations };
};

const resolveCompatibility = async (
  deps: AssetUpdateDeps,
  previousAssetVersion: number,
  assetVersion: number,
  observations: readonly VersionedClientBinaryObservation[],
): Promise<{ value: ProtocolCompatibility; stored: ProtocolCompatibility | null }> => {
  const stored = await deps.protocol.read(deps.storeRoot);
  const previous = stored?.assetVersion === previousAssetVersion ? stored : null;
  return {
    value: deps.protocol.resolve({ assetVersion, previous, observations }),
    stored,
  };
};

const sameCompatibility = (
  left: ProtocolCompatibility | null,
  right: ProtocolCompatibility,
): boolean =>
  left !== null &&
  left.schemaVersion === right.schemaVersion &&
  left.assetVersion === right.assetVersion &&
  left.protocolVersion === right.protocolVersion &&
  left.accountClientVersion === right.accountClientVersion &&
  left.clineVersionBase === right.clineVersionBase &&
  left.keyTableVersion === right.keyTableVersion &&
  left.keyTableSha256 === right.keyTableSha256 &&
  left.versionDllSha256 === right.versionDllSha256 &&
  left.wydExeSha256 === right.wydExeSha256;

/**
 * Core boot-gate logic (dependency-injected for testing).
 * - cold/incomplete ⇒ download base zip → staging, apply patches, verify, atomically promote.
 * - behind ⇒ copy store → staging, apply patches there, verify, atomically promote.
 * - current ⇒ proceed without downloading.
 *
 * Both download paths are FAIL-CLOSED: patches are applied to a STAGING copy and
 * the boot-critical assets are dry-parsed (`validate`) BEFORE promoting. A patch
 * whose files this build can't parse (e.g. a future record-width bump) leaves the
 * live store byte-untouched, does not bump the version, and returns 'blocked' —
 * so the store never holds a file the client can't read, and the user sees a boot
 * error instead of a silent corruption. Any error returns 'blocked'.
 */
export const runAssetUpdate = async (deps: AssetUpdateDeps): Promise<GateResult> => {
  deps.protocol.beginCheck();
  try {
    deps.onProgress?.('assets-checking');
    const src = await deps.fetchSource();
    const local = await deps.localVersion(deps.storeRoot);
    const complete = await deps.storeComplete(deps.storeRoot);
    const action = decideAssetAction(local, src.version, complete);

    if (action === 'up-to-date') {
      deps.logger?.info(`assets up-to-date at v${local}`);
      const compatibility = await resolveCompatibility(deps, local, local, []);
      if (!sameCompatibility(compatibility.stored, compatibility.value)) {
        await deps.writeVersion(deps.storeRoot, local, compatibility.value);
      }
      deps.protocol.install(compatibility.value);
      return 'proceed';
    }

    if (action === 'bootstrap') {
      deps.logger?.info(`asset cold bootstrap → v${src.version}`);
      await deps.resetDir(deps.stagingRoot);
      deps.onProgress?.('assets-downloading');
      const base = await deps.extract(await deps.openZipStream(src.baseZipUrl), deps.stagingRoot);
      deps.onProgress?.('assets-extracting');
      const patches = await applyPatches(deps, src, 0, src.version, deps.stagingRoot);
      if (!(await deps.storeComplete(deps.stagingRoot))) {
        throw new Error('asset bootstrap incomplete: required files missing after base + patches');
      }
      if (!(await validateStaging(deps))) {
        deps.protocol.block();
        return 'blocked';
      }
      const compatibility = await resolveCompatibility(deps, local, patches.applied, [
        ...versionObservations(base, 0),
        ...patches.observations,
      ]);
      await deps.writeVersion(deps.stagingRoot, patches.applied, compatibility.value);
      await deps.promote(deps.stagingRoot, deps.storeRoot);
      deps.protocol.install(compatibility.value);
      return 'proceed';
    }

    // warm patch: stage a copy of the live store, patch + validate it, then promote.
    deps.logger?.info(`asset update v${local} → v${src.version}`);
    deps.onProgress?.('assets-downloading');
    await deps.copyStore(deps.storeRoot, deps.stagingRoot);
    const patches = await applyPatches(deps, src, local, src.version, deps.stagingRoot);
    if (patches.applied === local) {
      // Only the top version was unpublished (404) — nothing changed; leave the store as-is.
      const compatibility = await resolveCompatibility(deps, local, local, []);
      if (!sameCompatibility(compatibility.stored, compatibility.value)) {
        await deps.writeVersion(deps.storeRoot, local, compatibility.value);
      }
      deps.protocol.install(compatibility.value);
      return 'proceed';
    }
    if (!(await validateStaging(deps))) {
      deps.protocol.block();
      return 'blocked';
    }
    const compatibility = await resolveCompatibility(
      deps,
      local,
      patches.applied,
      patches.observations,
    );
    await deps.writeVersion(deps.stagingRoot, patches.applied, compatibility.value);
    await deps.promote(deps.stagingRoot, deps.storeRoot);
    deps.protocol.install(compatibility.value);
    return 'proceed';
  } catch (err) {
    deps.protocol.block();
    deps.logger?.error(`asset update failed: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof ProtocolCompatibilityError) return 'protocol-incompatible';
    return 'blocked';
  }
};

/** Dry-parse the staged boot-critical assets; logs + returns false on any failure. */
const validateStaging = async (deps: AssetUpdateDeps): Promise<boolean> => {
  const failures = await deps.validate(deps.stagingRoot);
  if (failures.length === 0) return true;
  deps.logger?.error(
    `staged assets failed validation, refusing to promote: ` +
      failures.map((f) => `${f.asset}(${f.reason})`).join(', '),
  );
  return false;
};

/** Byte-progress callback for the active download (received vs Content-Length; total=0 if unknown). */
export type ByteProgress = (received: number, total: number) => void;

/** Adapt an electron `net.fetch` response body to an async byte iterable; 404 ⇒ MissingPatchError. */
const makeNetZipStream =
  (onBytes?: ByteProgress) =>
  async (url: string): Promise<AsyncIterable<Uint8Array>> => {
    const sep = url.includes('?') ? '&' : '?';
    const res = await net.fetch(`${url}${sep}cb=${Date.now()}`, {
      cache: 'no-store',
      headers: ASSET_REQUEST_HEADERS,
    });
    if (res.status === 404) throw new MissingPatchError(url);
    if (!res.ok || !res.body) throw new Error(`download HTTP ${res.status}: ${url}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    let received = 0;
    return {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.length;
            onBytes?.(received, total);
            yield value;
          }
        }
      },
    };
  };

/** Production boot gate: binds the real CDN fetch, userData store, and extractor. */
export const runAssetUpdateGate = async (
  onProgress?: (stage: AssetStage) => void,
  logger?: AssetUpdateDeps['logger'],
  onBytes?: ByteProgress,
  onEntry?: (dest: string) => void,
): Promise<GateResult> => {
  const storeRoot = assetStoreRoot();
  return runAssetUpdate({
    storeRoot,
    stagingRoot: join(app.getPath('userData'), 'game-assets', '.staging'),
    fetchSource: fetchGameAssetSource,
    localVersion: localAssetVersion,
    storeComplete: isStoreComplete,
    openZipStream: makeNetZipStream(onBytes),
    extract: (chunks, dest) => extractAllowlistedZip(chunks, dest, onEntry),
    writeVersion: writeAssetState,
    promote: promoteStaging,
    resetDir: async (dir) => {
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
    },
    copyStore: async (root, stagingDir) => {
      await rm(stagingDir, { recursive: true, force: true });
      await mkdir(stagingDir, { recursive: true });
      await cp(root, stagingDir, { recursive: true });
    },
    validate: (root) => validateBootCriticalAssets((name) => readFileOrNull(join(root, name))),
    isMissingPatch: (err) => err instanceof MissingPatchError,
    protocol: {
      beginCheck: beginProtocolCompatibilityCheck,
      block: blockProtocolCompatibility,
      read: async (root) => (await readAssetState(root))?.protocolCompatibility ?? null,
      resolve: resolveProtocolCompatibility,
      install: setProtocolCompatibility,
    },
    onProgress,
    logger,
  });
};
