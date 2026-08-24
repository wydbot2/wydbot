import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';

import { WORLD_SIZE } from '@shared/ipc/walkability';
import {
  fastMatchesDeep,
  fingerprintBufferSha256,
  fingerprintDeep,
  fingerprintFast,
} from '@main/lib';
import type { SourceFingerprint } from '@main/lib';
import { assetsLogger } from '@main/logging';

// Bumping this writes to a sibling `<userData>/heightmap/vN+1/` and abandons the
// old cache. Bump on ANY derivation-semantics change (trn/dat/objectBin parsers,
// heightmap-bake, sentinel conventions) — source fingerprints alone can never
// invalidate a stale builder's output.
//
// v2 (): no derivation change — the v1 blob is byte-identical. Bumped
// defensively to invalidate every v1 cache, which may have been produced by a
// code path that skipped `loadAttributeMap()` on cache-hit and so broke the
// zone-portal gate (`isZonePortalTile`). Forcing the cold path once guarantees
// the side-effect repopulates even on builds that haven't yet picked up the
// explicit `loadAttributeMap()` call on cache-hit.
const SCHEMA_VERSION = 2;

export const HEIGHTMAP_SIZE = WORLD_SIZE * WORLD_SIZE; // 16,777,216 bytes
const HASH_HEX_LEN = 16; // matches getHeightmapHash() in walkability-builder

/** A fingerprinted derivation input: stable logical key + absolute path. */
export interface HeightmapSourceFile {
  key: string;
  path: string;
}

export type HeightmapCacheStatus = 'cached' | 'mtime-drift';

export interface HeightmapCacheHit {
  world: Int8Array;
  hash: string;
  status: HeightmapCacheStatus;
  durationMs: number;
}

export interface HeightmapCacheStats {
  buildMs: number;
  sectorsLoaded: number;
  objectWalls: number;
  attrWalls: number;
}

interface HeightmapCacheManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  sources: Record<string, SourceFingerprint>;
  /** sha256 (first 16 hex chars) of heightmap.bin — identical to getHeightmapHash(). */
  hash: string;
  stats: HeightmapCacheStats;
}

/** `<userData>/heightmap/v<N>` — sibling dirs per schema, like the other caches. */
export const heightmapCacheDir = (): string =>
  join(app.getPath('userData'), 'heightmap', `v${SCHEMA_VERSION}`);

const isManifestShape = (v: unknown): v is HeightmapCacheManifest => {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m['schemaVersion'] === 'number' &&
    typeof m['appVersion'] === 'string' &&
    typeof m['sources'] === 'object' &&
    m['sources'] !== null &&
    typeof m['hash'] === 'string' &&
    typeof m['stats'] === 'object'
  );
};

const readManifest = async (path: string): Promise<HeightmapCacheManifest | null> => {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isManifestShape(parsed)) return null;
  if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
  return parsed;
};

const writeManifestAtomic = async (
  path: string,
  manifest: HeightmapCacheManifest,
): Promise<void> => {
  const tmp = `${path}.tmp`;
  const data = Buffer.from(JSON.stringify(manifest, null, 2));
  await writeFile(tmp, data, { flush: true });
  await rename(tmp, path);
};

/** Read + integrity-check the blob against the manifest hash. Null = treat as miss. */
const readValidatedBlob = async (
  blobPath: string,
  expectedHash: string,
): Promise<Int8Array | null> => {
  let buf: Buffer;
  try {
    buf = await readFile(blobPath);
  } catch {
    return null;
  }
  if (buf.length !== HEIGHTMAP_SIZE) return null;
  if (fingerprintBufferSha256(buf).slice(0, HASH_HEX_LEN) !== expectedHash) return null;
  return new Int8Array(buf.buffer, buf.byteOffset, buf.length);
};

const deepFingerprintSources = async (
  sources: readonly HeightmapSourceFile[],
): Promise<Record<string, SourceFingerprint>> => {
  const fps = await Promise.all(sources.map((s) => fingerprintDeep(s.path)));
  const map: Record<string, SourceFingerprint> = {};
  for (let i = 0; i < sources.length; i++) map[sources[i]!.key] = fps[i]!;
  return map;
};

const deepMatchesManifest = (
  manifest: HeightmapCacheManifest,
  sources: readonly HeightmapSourceFile[],
  deepFps: Record<string, SourceFingerprint>,
): boolean => {
  const storedKeys = Object.keys(manifest.sources);
  if (storedKeys.length !== sources.length) return false;
  for (const s of sources) {
    const stored = manifest.sources[s.key];
    if (!stored || stored.sha256 !== deepFps[s.key]!.sha256) return false;
  }
  return true;
};

/**
 * Try to serve the persisted heightmap. Two tiers, same economics as the icon
 * cache: tier 0 = stat-only fast fingerprints against the manifest; tier 1 =
 * mtime drifted (asset-update rewrote the store) but sha256 confirms identical
 * content → refresh mtimes and serve. Real content change / missing or corrupt
 * manifest / blob → null (caller rebuilds and rewrites).
 *
 * Never throws on cache problems — a broken cache must never break boot;
 * callers still wrap in try/catch as defense-in-depth.
 */
export const readHeightmapCache = async (
  cacheDir: string,
  sources: readonly HeightmapSourceFile[],
): Promise<HeightmapCacheHit | null> => {
  const startMs = Date.now();
  const manifestPath = join(cacheDir, 'manifest.json');
  const blobPath = join(cacheDir, 'heightmap.bin');

  const manifest = await readManifest(manifestPath);
  if (!manifest) return null;

  const tier0Start = Date.now();
  let fastOk = Object.keys(manifest.sources).length === sources.length;
  if (fastOk) {
    const fastFps = await Promise.all(
      sources.map(async (s) => {
        try {
          return await fingerprintFast(s.path);
        } catch {
          return null;
        }
      }),
    );
    for (let i = 0; i < sources.length && fastOk; i++) {
      const fp = fastFps[i];
      const stored = manifest.sources[sources[i]!.key];
      if (!fp || !stored || !fastMatchesDeep(fp, stored)) fastOk = false;
    }
  }
  const tier0Ms = Date.now() - tier0Start;

  if (fastOk) {
    const world = await readValidatedBlob(blobPath, manifest.hash);
    if (world) {
      assetsLogger.info(
        `World heightmap cached in ${Date.now() - startMs}ms (tier0=${tier0Ms}ms): ` +
          `${world.byteLength} bytes, hash=${manifest.hash}`,
      );
      return { world, hash: manifest.hash, status: 'cached', durationMs: Date.now() - startMs };
    }
    assetsLogger.warn('World heightmap cache blob failed integrity check — rebuilding');
    return null;
  }

  // Tier 1: mtime drift (store rewritten, content untouched) — confirm by sha.
  const tier1Start = Date.now();
  let deepFps: Record<string, SourceFingerprint>;
  try {
    deepFps = await deepFingerprintSources(sources);
  } catch (err) {
    assetsLogger.warn(
      `World heightmap cache source fingerprint failed — rebuilding (${err instanceof Error ? err.message : String(err)})`,
    );
    return null;
  }
  const tier1Ms = Date.now() - tier1Start;
  if (!deepMatchesManifest(manifest, sources, deepFps)) return null;

  const world = await readValidatedBlob(blobPath, manifest.hash);
  if (!world) {
    assetsLogger.warn('World heightmap cache blob failed integrity check — rebuilding');
    return null;
  }
  await writeManifestAtomic(manifestPath, {
    ...manifest,
    updatedAt: new Date().toISOString(),
    sources: deepFps,
  });
  assetsLogger.info(
    `World heightmap mtime-drift in ${Date.now() - startMs}ms (tier0=${tier0Ms}ms tier1=${tier1Ms}ms): ` +
      `manifest refreshed, hash=${manifest.hash}`,
  );
  return { world, hash: manifest.hash, status: 'mtime-drift', durationMs: Date.now() - startMs };
};

/**
 * Persist a freshly-built heightmap: blob (tmp→rename) then manifest (tmp→rename).
 * Source fingerprints are DEEP (this runs once per real source change — the cold
 * path already paid the IO, so correctness beats a second stat shortcut).
 * Throws on IO failure — the caller demotes that to a warn (cache is optional).
 */
export const writeHeightmapCache = async (
  cacheDir: string,
  world: Int8Array,
  sources: readonly HeightmapSourceFile[],
  stats: HeightmapCacheStats,
): Promise<void> => {
  await mkdir(cacheDir, { recursive: true });
  const blobPath = join(cacheDir, 'heightmap.bin');
  const blobTmp = `${blobPath}.tmp`;
  const bytes = Buffer.from(world.buffer, world.byteOffset, world.byteLength);
  await writeFile(blobTmp, bytes, { flush: true });
  await rename(blobTmp, blobPath);

  const now = new Date().toISOString();
  const existing = await readManifest(join(cacheDir, 'manifest.json'));
  const manifest: HeightmapCacheManifest = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: app.getVersion(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sources: await deepFingerprintSources(sources),
    hash: fingerprintBufferSha256(bytes).slice(0, HASH_HEX_LEN),
    stats,
  };
  await writeManifestAtomic(join(cacheDir, 'manifest.json'), manifest);
};
