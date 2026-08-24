import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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

import { assetsLogger } from '@main/logging';
import type { GridSpec } from '../icons';
import { extractCellRgba } from '../icons';
import { decodeAtlasesResilient } from '../decode-atlases';

// Atlas-keyed cache. Two URL schemes (wydaffect, wydskill) route to the same PNG dir.
const AFFECT_PROTOCOL_SCHEME = 'wydaffect';
const SKILL_PROTOCOL_SCHEME = 'wydskill';
const AFFECT_PROTOCOL_HOST = 'affects';
const SKILL_PROTOCOL_HOST = 'skills';
const WRITE_CONCURRENCY = 32;
const PNG_FILE_RE = /^\d{3}\.png$/;

// Bumping writes to a sibling `<userData>/amul/vN+1/` and abandons the old cache.
const SCHEMA_VERSION = 1;

const AMUL_GRID: GridSpec = {
  cellSize: 32,
  gridWidth: 16,
  gridHeight: 16,
  cellsPerPage: 256,
  atlasFileName: () => 'NewAmulOn.wyt',
};

const padId = (id: number): string => String(id).padStart(3, '0');

// Extract the full 16×16 atlas (256 cells).
const ALL_CELL_IDS: readonly number[] = Array.from({ length: 256 }, (_, i) => i);

interface DiscoveredSources {
  atlases: Map<string, string>;
}

export type AmulCacheStatus = 'cached' | 'cold-extract' | 'delta-extract' | 'mtime-drift';

export interface AmulCacheInitResult {
  status: AmulCacheStatus;
  spritesExtracted: number;
  spritesTotal: number;
  durationMs: number;
}

interface AmulCacheManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  sources: {
    atlases: Record<string, SourceFingerprint>;
  };
  stats: {
    spritesTotal: number;
    spritesWritten: number;
    lastFullExtractMs: number;
    lastDeltaCount: number;
  };
  sprites: Record<string, AmulCellEntry>;
}

interface AmulCellEntry {
  spriteId: number;
  atlasName: string;
  fileName: string;
}

const isManifestShape = (v: unknown): v is AmulCacheManifest => {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m['schemaVersion'] === 'number' &&
    typeof m['appVersion'] === 'string' &&
    typeof m['sources'] === 'object' &&
    m['sources'] !== null &&
    typeof m['stats'] === 'object' &&
    typeof m['sprites'] === 'object'
  );
};

const readManifest = async (path: string): Promise<AmulCacheManifest | null> => {
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

const writeManifestAtomic = async (path: string, manifest: AmulCacheManifest): Promise<void> => {
  const tmp = `${path}.tmp`;
  const data = Buffer.from(JSON.stringify(manifest, null, 2));
  await writeFile(tmp, data, { flush: true });
  await rename(tmp, path);
};

export class AmulCacheManager {
  // MUST run before app.whenReady() — Electron rejects late `standard:true` schemes.
  public static registerSchemeAsPrivileged(): void {
    const privileges = { standard: true, secure: true, supportFetchAPI: true };
    protocol.registerSchemesAsPrivileged([
      { scheme: AFFECT_PROTOCOL_SCHEME, privileges },
      { scheme: SKILL_PROTOCOL_SCHEME, privileges },
    ]);
  }

  private readonly cacheRoot: string;
  private readonly pngDir: string;
  private readonly manifestPath: string;
  private readyDone = false;
  private readonly readyWaiters: Array<() => void> = [];

  constructor() {
    this.cacheRoot = join(app.getPath('userData'), 'amul', `v${SCHEMA_VERSION}`);
    this.pngDir = join(this.cacheRoot, 'png');
    this.manifestPath = join(this.cacheRoot, 'manifest.json');
  }

  public registerProtocol(): void {
    const serve = async (req: Request, expectedHost: string): Promise<Response> => {
      const url = new URL(req.url);
      if (url.host !== expectedHost) return new Response(null, { status: 404 });
      const fileName = url.pathname.replace(/^\//, '');
      if (!PNG_FILE_RE.test(fileName)) return new Response(null, { status: 404 });
      return net.fetch(pathToFileURL(join(this.pngDir, fileName)).toString());
    };
    protocol.handle(AFFECT_PROTOCOL_SCHEME, (req) => serve(req, AFFECT_PROTOCOL_HOST));
    protocol.handle(SKILL_PROTOCOL_SCHEME, (req) => serve(req, SKILL_PROTOCOL_HOST));
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
  }): Promise<AmulCacheInitResult> {
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
  }): Promise<AmulCacheInitResult> {
    const startMs = Date.now();
    const onProgress = opts?.onProgress;
    await mkdir(this.pngDir, { recursive: true });

    const sources = await this.discoverSources();
    const sourceFiles = Array.from(sources.atlases.values());

    const tier0Start = Date.now();
    const fastFps = await Promise.all(sourceFiles.map((p) => fingerprintFast(p)));
    const tier0Ms = Date.now() - tier0Start;

    const existing = await readManifest(this.manifestPath);

    if (existing && this.fastMatches(existing, sources, fastFps)) {
      const durationMs = Date.now() - startMs;
      assetsLogger.info(
        `AmulCache cached in ${durationMs}ms (tier0=${tier0Ms}ms): ` +
          `${existing.stats.spritesWritten}/${existing.stats.spritesTotal} cells in ${this.pngDir}`,
      );
      return {
        status: 'cached',
        spritesExtracted: 0,
        spritesTotal: existing.stats.spritesWritten,
        durationMs,
      };
    }

    const deepStart = Date.now();
    const deepFps = await Promise.all(sourceFiles.map((p) => fingerprintDeep(p)));
    const deepMs = Date.now() - deepStart;

    const isCold = !existing;
    const dirty = isCold
      ? new Set(sources.atlases.keys())
      : this.diffAtlases(existing, sources, deepFps);

    if (!isCold && dirty.size === 0) {
      const refreshed = this.refreshManifestMtimes(existing, sources, deepFps);
      await writeManifestAtomic(this.manifestPath, refreshed);
      const durationMs = Date.now() - startMs;
      assetsLogger.info(
        `AmulCache mtime-drift in ${durationMs}ms (tier0=${tier0Ms}ms tier1=${deepMs}ms): ` +
          `manifest refreshed, no PNGs re-extracted`,
      );
      return {
        status: 'mtime-drift',
        spritesExtracted: 0,
        spritesTotal: existing.stats.spritesWritten,
        durationMs,
      };
    }

    const ioStart = Date.now();
    const atlasOrder = Array.from(sources.atlases.keys());
    const atlasBufs = await Promise.all(
      atlasOrder.map((name) => readFile(sources.atlases.get(name)!)),
    );
    const ioMs = Date.now() - ioStart;

    const parseStart = Date.now();
    const atlases = decodeAtlasesResilient(atlasOrder, atlasBufs, 'AmulCache');
    const parseMs = Date.now() - parseStart;

    const sprites = ALL_CELL_IDS;

    const buildStart = Date.now();
    let written = 0;
    let skippedMissingAtlas = 0;
    const spritesTotal = sprites.length;
    onProgress?.({ current: 0, total: spritesTotal });
    for (let i = 0; i < spritesTotal; i += WRITE_CONCURRENCY) {
      const batch = sprites.slice(i, i + WRITE_CONCURRENCY);
      await Promise.all(
        batch.map(async (spriteId) => {
          const atlasName = AMUL_GRID.atlasFileName(0).toLowerCase();
          const atlas = atlases.get(atlasName);
          if (!atlas) {
            skippedMissingAtlas++;
            return;
          }
          const rgba = extractCellRgba(AMUL_GRID, atlas, spriteId);
          const png = await encodeRgbaPng(rgba, AMUL_GRID.cellSize, AMUL_GRID.cellSize);
          const finalPath = join(this.pngDir, `${padId(spriteId)}.png`);
          const tmpPath = `${finalPath}.tmp`;
          await writeFile(tmpPath, png, { flush: true });
          await rename(tmpPath, finalPath);
          written++;
        }),
      );
      onProgress?.({ current: Math.min(i + WRITE_CONCURRENCY, spritesTotal), total: spritesTotal });
    }
    const buildMs = Date.now() - buildStart;

    const manifestStart = Date.now();
    const newManifest = this.buildManifest({
      sprites,
      atlasOrder,
      atlasFps: deepFps,
      lastFullExtractMs: isCold ? Date.now() - startMs : (existing?.stats.lastFullExtractMs ?? 0),
      lastDeltaCount: isCold ? 0 : written,
    });
    await writeManifestAtomic(this.manifestPath, newManifest);
    const manifestMs = Date.now() - manifestStart;

    const status: AmulCacheStatus = isCold ? 'cold-extract' : 'delta-extract';
    const durationMs = Date.now() - startMs;
    assetsLogger.info(
      `AmulCache ${status} in ${durationMs}ms ` +
        `(tier0=${tier0Ms}ms tier1=${deepMs}ms io=${ioMs}ms parse=${parseMs}ms ` +
        `build=${buildMs}ms manifest=${manifestMs}ms): ` +
        `${written} cells written, ${atlases.size} atlas decoded` +
        (skippedMissingAtlas > 0 ? `, ${skippedMissingAtlas} skipped (atlas missing)` : ''),
    );

    return {
      status,
      spritesExtracted: written,
      spritesTotal: sprites.length,
      durationMs,
    };
  }

  private async discoverSources(): Promise<DiscoveredSources> {
    const name = 'NewAmulOn.wyt';
    return { atlases: new Map([[name.toLowerCase(), getResourcePath(name)]]) };
  }

  private fastMatches(
    existing: AmulCacheManifest,
    sources: DiscoveredSources,
    fastFps: SourceFingerprintFast[],
  ): boolean {
    const atlasNames = Array.from(sources.atlases.keys());
    if (atlasNames.length !== Object.keys(existing.sources.atlases).length) return false;
    for (let i = 0; i < atlasNames.length; i++) {
      const name = atlasNames[i];
      const fp = fastFps[i];
      const stored = existing.sources.atlases[name];
      if (!stored || !fastMatchesDeep(fp, stored)) return false;
    }
    return true;
  }

  private diffAtlases(
    existing: AmulCacheManifest,
    sources: DiscoveredSources,
    deepFps: SourceFingerprint[],
  ): Set<string> {
    const dirty = new Set<string>();
    const atlasNames = Array.from(sources.atlases.keys());
    for (let i = 0; i < atlasNames.length; i++) {
      const name = atlasNames[i];
      const fp = deepFps[i];
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
    existing: AmulCacheManifest,
    sources: DiscoveredSources,
    deepFps: SourceFingerprint[],
  ): AmulCacheManifest {
    const atlasNames = Array.from(sources.atlases.keys());
    const refreshed: Record<string, SourceFingerprint> = {};
    for (let i = 0; i < atlasNames.length; i++) {
      refreshed[atlasNames[i]] = deepFps[i];
    }
    return {
      ...existing,
      updatedAt: new Date().toISOString(),
      sources: { atlases: refreshed },
    };
  }

  private buildManifest(args: {
    sprites: readonly number[];
    atlasOrder: string[];
    atlasFps: SourceFingerprint[];
    lastFullExtractMs: number;
    lastDeltaCount: number;
  }): AmulCacheManifest {
    const now = new Date().toISOString();
    const spritesMap: Record<string, AmulCellEntry> = {};
    const atlasName = AMUL_GRID.atlasFileName(0).toLowerCase();
    for (const spriteId of args.sprites) {
      spritesMap[padId(spriteId)] = {
        spriteId,
        atlasName,
        fileName: `${padId(spriteId)}.png`,
      };
    }
    const atlasesMap: Record<string, SourceFingerprint> = {};
    for (let i = 0; i < args.atlasOrder.length; i++) {
      atlasesMap[args.atlasOrder[i]] = args.atlasFps[i];
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: app.getVersion(),
      createdAt: now,
      updatedAt: now,
      sources: { atlases: atlasesMap },
      stats: {
        spritesTotal: args.sprites.length,
        spritesWritten: args.sprites.length,
        lastFullExtractMs: args.lastFullExtractMs,
        lastDeltaCount: args.lastDeltaCount,
      },
      sprites: spritesMap,
    };
  }
}
