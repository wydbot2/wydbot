import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, net, protocol } from 'electron';

import {
  encodeRgbaPng,
  fastMatchesDeep,
  fingerprintDeep,
  fingerprintFast,
  getResourcePath,
} from '@main/lib';
import type { SourceFingerprint, SourceFingerprintFast } from '@main/lib';
import { decodeWyt } from '@main/game-assets/parsers';
import type { WytAtlas } from '@main/game-assets/parsers';

import { assetsLogger } from '@main/logging';
import { decodeMapTileRgba } from './tile-decoder';

const PROTOCOL_SCHEME = 'wydmap';
const PROTOCOL_HOST = 'tiles';
const ATLAS_PATTERN = /^m(\d{2})(\d{2})\.wyt$/i;
const PNG_FILE_RE = /^m\d{2}\d{2}\.png$/;
const TILE_SIZE = 128;
const WRITE_CONCURRENCY = 64;

// Bumping this writes to a sibling `<userData>/maps/vN+1/` and abandons the old cache.
const SCHEMA_VERSION = 1;

const tileFileNameFromAtlas = (atlasName: string): string =>
  atlasName.toLowerCase().replace(/\.wyt$/, '.png');

interface DiscoveredSources {
  datPath: string;
  atlases: Map<string, string>;
}

export type MapCacheStatus = 'cached' | 'cold-extract' | 'delta-extract' | 'mtime-drift';

export interface MapCacheInitResult {
  status: MapCacheStatus;
  tilesExtracted: number;
  tilesTotal: number;
  durationMs: number;
}

interface MapCacheManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  sources: {
    minimapDat: SourceFingerprint;
    atlases: Record<string, SourceFingerprint>;
  };
  stats: {
    tilesTotal: number;
    tilesWithPng: number;
    lastFullExtractMs: number;
    lastDeltaCount: number;
  };
  tiles: Record<string, TileEntry>;
}

interface TileEntry {
  fileName: string;
  sourceName: string;
  width: number;
  height: number;
}

const isManifestShape = (v: unknown): v is MapCacheManifest => {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m['schemaVersion'] === 'number' &&
    typeof m['appVersion'] === 'string' &&
    typeof m['sources'] === 'object' &&
    m['sources'] !== null &&
    typeof m['stats'] === 'object' &&
    typeof m['tiles'] === 'object'
  );
};

const readManifest = async (path: string): Promise<MapCacheManifest | null> => {
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

const writeManifestAtomic = async (path: string, manifest: MapCacheManifest): Promise<void> => {
  const tmp = `${path}.tmp`;
  const data = Buffer.from(JSON.stringify(manifest, null, 2));
  await writeFile(tmp, data, { flush: true });
  await rename(tmp, path);
};

export class MapCacheManager {
  // MUST run before app.whenReady() — Electron rejects late `standard:true` schemes.
  public static registerSchemeAsPrivileged(): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: PROTOCOL_SCHEME,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
        },
      },
    ]);
  }

  private readonly cacheRoot: string;
  private readonly pngDir: string;
  private readonly manifestPath: string;
  private readyDone = false;
  private readonly readyWaiters: Array<() => void> = [];

  constructor() {
    this.cacheRoot = join(app.getPath('userData'), 'maps', `v${SCHEMA_VERSION}`);
    this.pngDir = join(this.cacheRoot, 'png');
    this.manifestPath = join(this.cacheRoot, 'manifest.json');
  }

  public registerProtocol(): void {
    protocol.handle(PROTOCOL_SCHEME, async (req) => {
      const url = new URL(req.url);
      if (url.host !== PROTOCOL_HOST) {
        return new Response(null, { status: 404 });
      }
      const fileName = url.pathname.replace(/^\//, '');
      if (!PNG_FILE_RE.test(fileName)) {
        return new Response(null, { status: 404 });
      }
      const filePath = join(this.pngDir, fileName);
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  /**
   * Resolve-only readiness barrier (same pattern as `asset-ready.ts`): resolves
   * once `initialize()` has committed the manifest, never rejects — a failed
   * boot keeps consumers pending while the splash shows the retry screen.
   * Waiter queue, not a swapped promise — see IconCacheManager.whenReady.
   */
  public whenReady(): Promise<void> {
    if (this.readyDone) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.readyWaiters.push(resolve);
    });
  }

  public async initialize(opts?: {
    onProgress?: (info: { current: number; total: number }) => void;
  }): Promise<MapCacheInitResult> {
    // Re-arm so a re-run (BOOT_RETRY after a failed boot) blocks consumers again.
    this.readyDone = false;
    const result = await this.doInitialize(opts);
    this.readyDone = true;
    const waiters = this.readyWaiters.splice(0);
    for (const resolve of waiters) resolve();
    return result;
  }

  private async doInitialize(opts?: {
    onProgress?: (info: { current: number; total: number }) => void;
  }): Promise<MapCacheInitResult> {
    const startMs = Date.now();
    const onProgress = opts?.onProgress;
    await mkdir(this.pngDir, { recursive: true });

    const sources = await this.discoverSources();
    const sourceFiles = [sources.datPath, ...sources.atlases.values()];

    const tier0Start = Date.now();
    const fastFps = await Promise.all(sourceFiles.map((p) => fingerprintFast(p)));
    const tier0Ms = Date.now() - tier0Start;

    const existing = await readManifest(this.manifestPath);

    if (existing && this.fastMatches(existing, sources, fastFps)) {
      const durationMs = Date.now() - startMs;
      assetsLogger.info(
        `MapCache cached in ${durationMs}ms (tier0=${tier0Ms}ms): ` +
          `${existing.stats.tilesWithPng}/${existing.stats.tilesTotal} tiles in ${this.pngDir}`,
      );
      return {
        status: 'cached',
        tilesExtracted: 0,
        tilesTotal: existing.stats.tilesWithPng,
        durationMs,
      };
    }

    const deepStart = Date.now();
    const deepFps = await Promise.all(sourceFiles.map((p) => fingerprintDeep(p)));
    const deepMs = Date.now() - deepStart;

    const isCold = !existing;
    const dirtyAtlasNames = isCold
      ? new Set(sources.atlases.keys())
      : this.diffAtlases(existing, sources, deepFps);

    if (!isCold && dirtyAtlasNames.size === 0 && this.datUnchanged(existing, deepFps[0])) {
      const refreshed = this.refreshManifestMtimes(existing, sources, deepFps);
      await writeManifestAtomic(this.manifestPath, refreshed);
      const durationMs = Date.now() - startMs;
      assetsLogger.info(
        `MapCache mtime-drift in ${durationMs}ms (tier0=${tier0Ms}ms tier1=${deepMs}ms): ` +
          `manifest refreshed, no PNGs re-extracted`,
      );
      return {
        status: 'mtime-drift',
        tilesExtracted: 0,
        tilesTotal: existing.stats.tilesWithPng,
        durationMs,
      };
    }

    const ioStart = Date.now();
    const atlasBufs = await Promise.all(
      Array.from(sources.atlases.values()).map((p) => readFile(p)),
    );
    const ioMs = Date.now() - ioStart;

    const parseStart = Date.now();
    const atlasOrder = Array.from(sources.atlases.keys());
    const atlases = new Map<string, WytAtlas | null>();
    let failedDecode = 0;
    for (let i = 0; i < atlasOrder.length; i++) {
      const name = atlasOrder[i];
      try {
        atlases.set(name, decodeWyt(atlasBufs[i]));
      } catch {
        atlases.set(name, null);
        failedDecode++;
      }
    }
    const parseMs = Date.now() - parseStart;

    const dirtyAtlasList = Array.from(dirtyAtlasNames);

    const buildStart = Date.now();
    let written = 0;
    const dirtyTotal = dirtyAtlasList.length;
    onProgress?.({ current: 0, total: dirtyTotal });
    for (let i = 0; i < dirtyTotal; i += WRITE_CONCURRENCY) {
      const batch = dirtyAtlasList.slice(i, i + WRITE_CONCURRENCY);
      await Promise.all(
        batch.map(async (atlasName) => {
          const atlas = atlases.get(atlasName);
          if (!atlas) return;
          const rgba = decodeMapTileRgba(atlas);
          const png = await encodeRgbaPng(rgba, TILE_SIZE, TILE_SIZE);
          const fileName = tileFileNameFromAtlas(atlasName);
          const finalPath = join(this.pngDir, fileName);
          const tmpPath = `${finalPath}.tmp`;
          await writeFile(tmpPath, png, { flush: true });
          await rename(tmpPath, finalPath);
          written++;
        }),
      );
      onProgress?.({ current: Math.min(i + WRITE_CONCURRENCY, dirtyTotal), total: dirtyTotal });
    }
    const buildMs = Date.now() - buildStart;

    const manifestStart = Date.now();
    const newManifest = this.buildManifest({
      atlasOrder,
      atlasFps: deepFps.slice(1),
      datFp: deepFps[0],
      lastFullExtractMs: isCold ? Date.now() - startMs : (existing?.stats.lastFullExtractMs ?? 0),
      lastDeltaCount: isCold ? 0 : written,
    });
    await writeManifestAtomic(this.manifestPath, newManifest);
    const manifestMs = Date.now() - manifestStart;

    const status: MapCacheStatus = isCold ? 'cold-extract' : 'delta-extract';
    const durationMs = Date.now() - startMs;
    const decoded = atlasOrder.length - failedDecode;
    assetsLogger.info(
      `MapCache ${status} in ${durationMs}ms ` +
        `(tier0=${tier0Ms}ms tier1=${deepMs}ms io=${ioMs}ms parse=${parseMs}ms ` +
        `build=${buildMs}ms manifest=${manifestMs}ms): ` +
        `${written} tiles written, ${decoded} atlases decoded` +
        (failedDecode > 0 ? `, ${failedDecode} failed to decode` : ''),
    );

    return {
      status,
      tilesExtracted: written,
      tilesTotal: atlasOrder.length,
      durationMs,
    };
  }

  private async discoverSources(): Promise<DiscoveredSources> {
    const datPath = getResourcePath('minimap.dat');
    const mapsDir = getResourcePath('maps');
    const entries = await readdir(mapsDir);
    const atlases = new Map<string, string>();
    for (const name of entries) {
      const m = name.match(ATLAS_PATTERN);
      if (!m) continue;
      atlases.set(name.toLowerCase(), join(mapsDir, name));
    }
    if (atlases.size === 0) {
      throw new Error(`No atlas files (m{XX}{YY}.wyt) found in ${mapsDir}`);
    }
    return { datPath, atlases };
  }

  private fastMatches(
    existing: MapCacheManifest,
    sources: DiscoveredSources,
    fastFps: SourceFingerprintFast[],
  ): boolean {
    if (!fastMatchesDeep(fastFps[0], existing.sources.minimapDat)) return false;
    const atlasNames = Array.from(sources.atlases.keys());
    if (atlasNames.length !== Object.keys(existing.sources.atlases).length) return false;
    for (let i = 0; i < atlasNames.length; i++) {
      const name = atlasNames[i];
      const fp = fastFps[i + 1];
      const stored = existing.sources.atlases[name];
      if (!stored || !fastMatchesDeep(fp, stored)) return false;
    }
    return true;
  }

  private datUnchanged(existing: MapCacheManifest, deepDat: SourceFingerprint): boolean {
    return existing.sources.minimapDat.sha256 === deepDat.sha256;
  }

  private diffAtlases(
    existing: MapCacheManifest,
    sources: DiscoveredSources,
    deepFps: SourceFingerprint[],
  ): Set<string> {
    const dirty = new Set<string>();
    const atlasNames = Array.from(sources.atlases.keys());
    for (let i = 0; i < atlasNames.length; i++) {
      const name = atlasNames[i];
      const fp = deepFps[i + 1];
      const stored = existing.sources.atlases[name];
      if (!stored || stored.sha256 !== fp.sha256) {
        dirty.add(name);
      }
    }
    for (const name of Object.keys(existing.sources.atlases)) {
      if (!sources.atlases.has(name)) dirty.add(name);
    }
    return dirty;
  }

  private refreshManifestMtimes(
    existing: MapCacheManifest,
    sources: DiscoveredSources,
    deepFps: SourceFingerprint[],
  ): MapCacheManifest {
    const atlasNames = Array.from(sources.atlases.keys());
    const refreshedAtlases: Record<string, SourceFingerprint> = {};
    for (let i = 0; i < atlasNames.length; i++) {
      refreshedAtlases[atlasNames[i]] = deepFps[i + 1];
    }
    return {
      ...existing,
      updatedAt: new Date().toISOString(),
      sources: {
        minimapDat: deepFps[0],
        atlases: refreshedAtlases,
      },
    };
  }

  private buildManifest(args: {
    atlasOrder: string[];
    atlasFps: SourceFingerprint[];
    datFp: SourceFingerprint;
    lastFullExtractMs: number;
    lastDeltaCount: number;
  }): MapCacheManifest {
    const now = new Date().toISOString();
    const tiles: Record<string, TileEntry> = {};
    const atlasesMap: Record<string, SourceFingerprint> = {};
    let tilesWithPng = 0;
    for (let i = 0; i < args.atlasOrder.length; i++) {
      const atlasName = args.atlasOrder[i];
      atlasesMap[atlasName] = args.atlasFps[i];
      const m = atlasName.match(ATLAS_PATTERN);
      if (!m) continue;
      const key = `${m[1]}${m[2]}`;
      tiles[key] = {
        fileName: tileFileNameFromAtlas(atlasName),
        sourceName: atlasName,
        width: TILE_SIZE,
        height: TILE_SIZE,
      };
      tilesWithPng++;
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: app.getVersion(),
      createdAt: now,
      updatedAt: now,
      sources: {
        minimapDat: args.datFp,
        atlases: atlasesMap,
      },
      stats: {
        tilesTotal: args.atlasOrder.length,
        tilesWithPng,
        lastFullExtractMs: args.lastFullExtractMs,
        lastDeltaCount: args.lastDeltaCount,
      },
      tiles,
    };
  }
}
