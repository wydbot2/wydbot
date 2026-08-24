import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
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
import { parseItemIconBin } from '@main/game-assets/parsers';
import type { ItemIconTable, WytAtlas } from '@main/game-assets/parsers';

import { assetsLogger } from '@main/logging';
import { decodeAtlasesResilient } from '../decode-atlases';
import {
  ICON_GRID,
  atlasFileNameForCell,
  atlasNumForCell,
  cellRectInPage,
  extractCellRgba,
} from './cell-extractor';
import type { CellRect } from './cell-extractor';

const PROTOCOL_SCHEME = 'wydicon';
const PROTOCOL_HOST = 'icons';
const ATLAS_PATTERN = /^itemicon(\d{2})\.wyt$/i;
const WRITE_CONCURRENCY = 64;
const PNG_FILE_RE = /^\d{5}\.png$/;
const NO_DIRTY_ATLASES: ReadonlySet<string> = new Set();

// Bumping this writes to a sibling `<userData>/icons/vN+1/` and abandons the old cache.
// Bump on ANY extraction-OUTPUT change (decoder, cell math) — source fingerprints
// alone can never invalidate a stale extractor's output. Manifest-METADATA changes
// (e.g. the optional `unextractable` field) do NOT need a bump: old manifests read
// with the field absent and self-migrate on the next write, avoiding a forced
// cold-extract across the whole user base.
const SCHEMA_VERSION = 3;

const padId = (id: number): string => String(id).padStart(5, '0');

interface DiscoveredSources {
  iconBinPath: string;
  atlases: Map<string, string>;
}

export type IconCacheStatus = 'cached' | 'cold-extract' | 'delta-extract' | 'mtime-drift';

export interface IconCacheInitResult {
  status: IconCacheStatus;
  iconsExtracted: number;
  iconsTotal: number;
  durationMs: number;
}

interface IconCacheManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  sources: {
    itemIconBin: SourceFingerprint;
    atlases: Record<string, SourceFingerprint>;
  };
  stats: {
    itemsTotal: number;
    itemsWithIcon: number;
    pagesUsed: number[];
    lastFullExtractMs: number;
    lastDeltaCount: number;
  };
  /**
   * Ids whose atlas is absent from the sources — permanently unextractable
   * until the SOURCES change (a new/changed atlas file flips the fingerprint
   * diff and re-tries them automatically). Transient failures (write/encode,
   * cell geometry) are NOT recorded here: they stay out of `items` only, so
   * the self-heal path retries them every boot. Optional: manifests written
   * before this field existed read as empty and self-migrate on next write.
   */
  unextractable?: Record<string, 'atlas-missing'>;
  items: Record<string, IconEntry>;
}

interface IconEntry {
  cellIdx: number;
  atlasName: string;
  rect: CellRect;
  fileName: string;
}

const isManifestShape = (v: unknown): v is IconCacheManifest => {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m['schemaVersion'] === 'number' &&
    typeof m['appVersion'] === 'string' &&
    typeof m['sources'] === 'object' &&
    m['sources'] !== null &&
    typeof m['stats'] === 'object' &&
    typeof m['items'] === 'object'
  );
};

const readManifest = async (path: string): Promise<IconCacheManifest | null> => {
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

const writeManifestAtomic = async (path: string, manifest: IconCacheManifest): Promise<void> => {
  const tmp = `${path}.tmp`;
  const data = Buffer.from(JSON.stringify(manifest, null, 2));
  await writeFile(tmp, data, { flush: true });
  await rename(tmp, path);
};

export class IconCacheManager {
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
    this.cacheRoot = join(app.getPath('userData'), 'icons', `v${SCHEMA_VERSION}`);
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
   *
   * Implemented as a waiter QUEUE, not a swapped promise: a promise re-armed
   * per run orphans every waiter that attached before it (observed: the
   * renderer's early `data:get-item-db` invoke hung forever when it beat the
   * boot's first `initialize()` — dead "Entrar" on the charlist).
   */
  public whenReady(): Promise<void> {
    if (this.readyDone) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.readyWaiters.push(resolve);
    });
  }

  public async initialize(opts?: {
    onProgress?: (info: { current: number; total: number }) => void;
  }): Promise<IconCacheInitResult> {
    // Re-arm so a re-run (BOOT_RETRY after a failed boot) blocks consumers again.
    this.readyDone = false;
    const result = await this.doInitialize(opts);
    this.readyDone = true;
    const waiters = this.readyWaiters.splice(0);
    for (const resolve of waiters) resolve();
    return result;
  }

  /**
   * Reads the on-disk manifest and returns the item IDs that have an extracted
   * PNG. Pure disk read — instance-independent. Callers racing THIS instance's
   * `initialize()` must await `whenReady()` first (see `item-db-handler.ts`).
   */
  public async getAvailableIconIds(): Promise<ReadonlySet<number>> {
    const manifest = await readManifest(this.manifestPath);
    if (!manifest) return new Set();
    const ids = new Set<number>();
    for (const key of Object.keys(manifest.items)) {
      const n = Number(key);
      if (Number.isInteger(n)) ids.add(n);
    }
    return ids;
  }

  private async doInitialize(opts?: {
    onProgress?: (info: { current: number; total: number }) => void;
  }): Promise<IconCacheInitResult> {
    const startMs = Date.now();
    const onProgress = opts?.onProgress;
    await mkdir(this.pngDir, { recursive: true });

    const sources = await this.discoverSources();
    const sourceFiles = [sources.iconBinPath, ...sources.atlases.values()];

    const tier0Start = Date.now();
    const fastFps = await Promise.all(sourceFiles.map((p) => fingerprintFast(p)));
    const tier0Ms = Date.now() - tier0Start;

    const existing = await readManifest(this.manifestPath);

    // Tier 0 additionally verifies manifest completeness: any mapped id with a
    // missing/stale entry falls through to the extract path (self-heal).
    // preloadedTable may lag the later bulk read of the bin by one version;
    // the next boot self-heals via the cellIdx-mismatch check.
    let preloadedTable: ItemIconTable | null = null;
    let driftWarned = false;
    const warnDrift = (table: ItemIconTable): void => {
      if (driftWarned) return;
      driftWarned = true;
      this.warnMissingAtlases(table, sources);
    };
    if (existing && this.fastMatches(existing, sources, fastFps)) {
      preloadedTable = parseItemIconBin(await readFile(sources.iconBinPath));
      warnDrift(preloadedTable);
      if (this.computeDirtyItems(preloadedTable, existing, NO_DIRTY_ATLASES).length === 0) {
        const durationMs = Date.now() - startMs;
        assetsLogger.info(
          `IconCache cached in ${durationMs}ms (tier0=${tier0Ms}ms): ` +
            `${existing.stats.itemsWithIcon}/${existing.stats.itemsTotal} icons in ${this.pngDir}`,
        );
        return {
          status: 'cached',
          iconsExtracted: 0,
          iconsTotal: existing.stats.itemsWithIcon,
          durationMs,
        };
      }
    }

    const deepStart = Date.now();
    const deepFps = await Promise.all(sourceFiles.map((p) => fingerprintDeep(p)));
    const deepMs = Date.now() - deepStart;

    const isCold = !existing;
    const dirtyAtlasNames = isCold
      ? new Set(sources.atlases.keys())
      : this.diffAtlases(existing, sources, deepFps);

    if (!isCold && dirtyAtlasNames.size === 0 && this.iconBinUnchanged(existing, deepFps[0])) {
      preloadedTable ??= parseItemIconBin(await readFile(sources.iconBinPath));
      warnDrift(preloadedTable);
      if (this.computeDirtyItems(preloadedTable, existing, NO_DIRTY_ATLASES).length === 0) {
        const refreshed = this.refreshManifestMtimes(existing, sources, deepFps);
        await writeManifestAtomic(this.manifestPath, refreshed);
        const durationMs = Date.now() - startMs;
        assetsLogger.info(
          `IconCache mtime-drift in ${durationMs}ms (tier0=${tier0Ms}ms tier1=${deepMs}ms): ` +
            `manifest refreshed, no PNGs re-extracted`,
        );
        return {
          status: 'mtime-drift',
          iconsExtracted: 0,
          iconsTotal: existing.stats.itemsWithIcon,
          durationMs,
        };
      }
    }

    const ioStart = Date.now();
    const [iconBinBuf, ...atlasBufs] = await Promise.all([
      readFile(sources.iconBinPath),
      ...Array.from(sources.atlases.values()).map((p) => readFile(p)),
    ]);
    const ioMs = Date.now() - ioStart;

    const parseStart = Date.now();
    const iconTable = preloadedTable ?? parseItemIconBin(iconBinBuf);
    warnDrift(iconTable);
    const atlasOrder = Array.from(sources.atlases.keys());
    const atlases = decodeAtlasesResilient(atlasOrder, atlasBufs, 'IconCache');
    const parseMs = Date.now() - parseStart;

    const dirtyItemIds = isCold
      ? Array.from(iconTable.map.keys())
      : this.computeDirtyItems(iconTable, existing, dirtyAtlasNames);
    const dirtyIdSet = new Set(dirtyItemIds);

    const buildStart = Date.now();
    const writtenIds = new Set<number>();
    const atlasMissingIds = new Set<number>();
    const dirtyTotal = dirtyItemIds.length;
    onProgress?.({ current: 0, total: dirtyTotal });
    for (let i = 0; i < dirtyTotal; i += WRITE_CONCURRENCY) {
      const batch = dirtyItemIds.slice(i, i + WRITE_CONCURRENCY);
      await Promise.all(
        batch.map(async (itemId) => {
          const cellIdx1 = iconTable.map.get(itemId)!;
          const cellIdx0 = cellIdx1 - 1;
          const atlasName = atlasFileNameForCell(ICON_GRID, cellIdx0).toLowerCase();
          const atlas = atlases.get(atlasName);
          if (!atlas) {
            atlasMissingIds.add(itemId);
            return;
          }
          try {
            const rgba = extractCellRgba(ICON_GRID, atlas, cellIdx0);
            const png = await encodeRgbaPng(rgba, 100, 100);
            const finalPath = join(this.pngDir, `${padId(itemId)}.png`);
            const tmpPath = `${finalPath}.tmp`;
            await writeFile(tmpPath, png, { flush: true });
            await rename(tmpPath, finalPath);
            writtenIds.add(itemId);
          } catch (err) {
            // A single unreadable cell drops that one icon OUT OF THE MANIFEST
            // (never the batch); the next boot re-tries it via computeDirtyItems.
            assetsLogger.warn(
              `IconCache: cell for item ${itemId} failed, skipping — ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }),
      );
      onProgress?.({ current: Math.min(i + WRITE_CONCURRENCY, dirtyTotal), total: dirtyTotal });
    }
    const buildMs = Date.now() - buildStart;

    const manifestStart = Date.now();
    const newManifest = this.buildManifest({
      iconTable,
      existing: existing ?? null,
      dirtyIdSet,
      writtenIds,
      atlasMissingIds,
      atlases,
      atlasOrder,
      atlasFps: deepFps.slice(1),
      iconBinFp: deepFps[0],
      lastFullExtractMs: isCold ? Date.now() - startMs : (existing?.stats.lastFullExtractMs ?? 0),
      lastDeltaCount: isCold ? 0 : writtenIds.size,
    });
    await writeManifestAtomic(this.manifestPath, newManifest);
    const orphansRemoved = await this.removeOrphanPngs(iconTable);
    const manifestMs = Date.now() - manifestStart;

    const status: IconCacheStatus = isCold ? 'cold-extract' : 'delta-extract';
    const durationMs = Date.now() - startMs;
    assetsLogger.info(
      `IconCache ${status} in ${durationMs}ms ` +
        `(tier0=${tier0Ms}ms tier1=${deepMs}ms io=${ioMs}ms parse=${parseMs}ms ` +
        `build=${buildMs}ms manifest=${manifestMs}ms): ` +
        `${writtenIds.size} icons written, ${atlases.size} atlases decoded` +
        (atlasMissingIds.size > 0 ? `, ${atlasMissingIds.size} skipped (atlas missing)` : '') +
        (orphansRemoved > 0 ? `, ${orphansRemoved} orphans removed` : ''),
    );

    return {
      status,
      iconsExtracted: writtenIds.size,
      iconsTotal: Object.keys(newManifest.items).length,
      durationMs,
    };
  }

  private async discoverSources(): Promise<DiscoveredSources> {
    const iconBinPath = getResourcePath('itemicon.bin');
    const iconsDir = getResourcePath('Icons');
    const entries = await readdir(iconsDir);
    const atlases = new Map<string, string>();
    for (const name of entries) {
      const m = name.match(ATLAS_PATTERN);
      if (!m) continue;
      atlases.set(name.toLowerCase(), join(iconsDir, name));
    }
    if (atlases.size === 0) {
      throw new Error(`No atlas files (itemiconNN.wyt) found in ${iconsDir}`);
    }
    return { iconBinPath, atlases };
  }

  private fastMatches(
    existing: IconCacheManifest,
    sources: DiscoveredSources,
    fastFps: SourceFingerprintFast[],
  ): boolean {
    if (!fastMatchesDeep(fastFps[0], existing.sources.itemIconBin)) return false;
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

  private iconBinUnchanged(existing: IconCacheManifest, deepIconBin: SourceFingerprint): boolean {
    return existing.sources.itemIconBin.sha256 === deepIconBin.sha256;
  }

  /**
   * One-shot drift warning: itemicon.bin referencing atlas files absent from
   * Icons/ is how game/server asset drift surfaces (e.g. v721 added page-93
   * cells with no itemicon93.wyt in the shipped client). Loud in the log so the
   * next drift is one grep away instead of a multi-day investigation.
   */
  private warnMissingAtlases(iconTable: ItemIconTable, sources: DiscoveredSources): void {
    const missing = new Map<string, number>();
    for (const cellIdx1 of iconTable.map.values()) {
      const atlasName = atlasFileNameForCell(ICON_GRID, cellIdx1 - 1).toLowerCase();
      if (!sources.atlases.has(atlasName)) {
        missing.set(atlasName, (missing.get(atlasName) ?? 0) + 1);
      }
    }
    if (missing.size === 0) return;
    const detail = Array.from(missing.entries())
      .map(([name, count]) => `${name} (${count} items)`)
      .join(', ');
    assetsLogger.warn(
      `IconCache: itemicon.bin references atlas(es) absent from Icons/: ${detail} — affected icons will fall back to text`,
    );
  }

  private diffAtlases(
    existing: IconCacheManifest,
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

  /**
   * Ids that need (re-)extraction: cells in a dirty atlas, cells remapped by an
   * itemicon.bin update (regardless of atlas dirtiness), or ids absent from the
   * manifest (failed/skipped in a previous run — the self-heal path). Ids KNOWN
   * to be unextractable (`unextractable: atlas-missing`) are tolerated while
   * their atlas stays absent — if the file ever shows up, the fingerprint diff
   * marks it dirty and the first condition re-tries them automatically.
   */
  private computeDirtyItems(
    iconTable: ItemIconTable,
    existing: IconCacheManifest,
    dirtyAtlasNames: ReadonlySet<string>,
  ): number[] {
    const dirty: number[] = [];
    for (const [itemId, cellIdx1] of iconTable.map) {
      const cellIdx0 = cellIdx1 - 1;
      const atlasName = atlasFileNameForCell(ICON_GRID, cellIdx0).toLowerCase();
      const prevEntry = existing.items[padId(itemId)];
      if (dirtyAtlasNames.has(atlasName) || (prevEntry && prevEntry.cellIdx !== cellIdx1)) {
        dirty.push(itemId);
        continue;
      }
      if (!prevEntry && existing.unextractable?.[padId(itemId)] !== 'atlas-missing') {
        dirty.push(itemId);
      }
    }
    return dirty;
  }

  // `.tmp` parts are always dropped (crashed-write leftovers); PNGs only when
  // the id left the bin — a mapped-but-unwritten id keeps its stale-but-renderable
  // PNG while the manifest honestly omits it and the next boot re-tries.
  private async removeOrphanPngs(iconTable: ItemIconTable): Promise<number> {
    const files = await readdir(this.pngDir);
    let removed = 0;
    await Promise.all(
      files.map(async (f) => {
        if (
          f.endsWith('.tmp') ||
          (PNG_FILE_RE.test(f) && !iconTable.map.has(Number(f.slice(0, 5))))
        ) {
          await rm(join(this.pngDir, f), { force: true });
          removed++;
        }
      }),
    );
    return removed;
  }

  private refreshManifestMtimes(
    existing: IconCacheManifest,
    sources: DiscoveredSources,
    deepFps: SourceFingerprint[],
  ): IconCacheManifest {
    const atlasNames = Array.from(sources.atlases.keys());
    const refreshedAtlases: Record<string, SourceFingerprint> = {};
    for (let i = 0; i < atlasNames.length; i++) {
      refreshedAtlases[atlasNames[i]] = deepFps[i + 1];
    }
    return {
      ...existing,
      updatedAt: new Date().toISOString(),
      sources: {
        itemIconBin: deepFps[0],
        atlases: refreshedAtlases,
      },
    };
  }

  /**
   * Honest manifest: an id is recorded only when its PNG was written in this run
   * or kept untouched (not dirty, same cell as before). Ids whose write failed or
   * whose atlas was undecodable are OMITTED from `items` — so the next boot
   * re-tries them — UNLESS the atlas is absent from the sources, in which case
   * the id lands in `unextractable` and stops being retried until the sources
   * change (permanent-miss negative caching; transient failures still retry).
   */
  private buildManifest(args: {
    iconTable: ItemIconTable;
    existing: IconCacheManifest | null;
    dirtyIdSet: Set<number>;
    writtenIds: Set<number>;
    atlasMissingIds: Set<number>;
    atlases: Map<string, WytAtlas>;
    atlasOrder: string[];
    atlasFps: SourceFingerprint[];
    iconBinFp: SourceFingerprint;
    lastFullExtractMs: number;
    lastDeltaCount: number;
  }): IconCacheManifest {
    const now = new Date().toISOString();
    const items: Record<string, IconEntry> = {};
    const unextractable: Record<string, 'atlas-missing'> = {};
    const pagesUsed = new Set<number>();
    for (const [itemId, cellIdx1] of args.iconTable.map) {
      const cellIdx0 = cellIdx1 - 1;
      const key = padId(itemId);
      const prevEntry = args.existing?.items[key];
      // The last two conjuncts are defense-in-depth: a non-dirty id already
      // implies a matching prevEntry via computeDirtyItems.
      const shouldKeep =
        args.writtenIds.has(itemId) ||
        (!args.dirtyIdSet.has(itemId) && prevEntry !== undefined && prevEntry.cellIdx === cellIdx1);
      if (!shouldKeep) {
        const atlasName = atlasFileNameForCell(ICON_GRID, cellIdx0).toLowerCase();
        const knownMissing = args.existing?.unextractable?.[key] === 'atlas-missing';
        if (args.atlasMissingIds.has(itemId) || (knownMissing && !args.atlases.has(atlasName))) {
          unextractable[key] = 'atlas-missing';
        }
        continue;
      }
      const atlasName = atlasFileNameForCell(ICON_GRID, cellIdx0).toLowerCase();
      const topDown = args.atlases.get(atlasName)?.topDown ?? false;
      pagesUsed.add(atlasNumForCell(ICON_GRID, cellIdx0));
      items[key] = {
        cellIdx: cellIdx1,
        atlasName,
        rect: cellRectInPage(ICON_GRID, cellIdx0, topDown),
        fileName: `${key}.png`,
      };
    }
    const atlasesMap: Record<string, SourceFingerprint> = {};
    for (let i = 0; i < args.atlasOrder.length; i++) {
      atlasesMap[args.atlasOrder[i]] = args.atlasFps[i];
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: app.getVersion(),
      createdAt: args.existing?.createdAt ?? now,
      updatedAt: now,
      sources: {
        itemIconBin: args.iconBinFp,
        atlases: atlasesMap,
      },
      stats: {
        itemsTotal: 6500,
        itemsWithIcon: Object.keys(items).length,
        pagesUsed: Array.from(pagesUsed).sort((a, b) => a - b),
        lastFullExtractMs: args.lastFullExtractMs,
        lastDeltaCount: args.lastDeltaCount,
      },
      unextractable,
      items,
    };
  }
}
