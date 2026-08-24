import { mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HEIGHTMAP_SIZE,
  heightmapCacheDir,
  readHeightmapCache,
  writeHeightmapCache,
  type HeightmapSourceFile,
} from '@main/cache/heightmap';

// Paths derive from the globally mocked app.getPath (tests/setup.ts) — no other
// suite may use this userData root without namespacing, or parallel runs collide.
const USER_DATA = join(tmpdir(), 'wydbot-test');
const SRC_DIR = join(USER_DATA, 'heightmap-test-src');
const CACHE_DIR = heightmapCacheDir();
const BLOB_PATH = join(CACHE_DIR, 'heightmap.bin');
const MANIFEST_PATH = join(CACHE_DIR, 'manifest.json');

// Builder-integration fixtures live in their OWN namespaced root (the icon
// suite owns `game-assets/v1` and wipes it) via a getResourcePath override.
const BUILDER_SRC_ROOT = join(USER_DATA, 'heightmap-builder-src');

vi.mock('@main/lib', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@main/lib')>();
  return {
    ...orig,
    getResourcePath: (...segments: string[]) => join(BUILDER_SRC_ROOT, ...segments),
  };
});

vi.mock('@main/game-assets/parsers/trn-parser', () => ({
  parseTrn: vi.fn(() => ({ heights: new Int8Array(64 * 64).fill(5) })),
}));

vi.mock('@main/game-assets/attribute-map-handler', () => ({
  loadAttributeMap: vi.fn(async () => Buffer.alloc(1024 * 1024)),
}));

vi.mock('@main/game-assets/object-data-loader', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@main/game-assets/object-data-loader')>();
  return {
    ...orig,
    loadObjectData: vi.fn(async () => {}),
    getFieldObjects: () => [],
    getObjectSilhouette: () => null,
  };
});

const STATS = { buildMs: 123, sectorsLoaded: 2, objectWalls: 10, attrWalls: 20 };

const makeWorld = (fill: number): Int8Array => new Int8Array(HEIGHTMAP_SIZE).fill(fill);

const writeSources = async (files: Record<string, string>): Promise<HeightmapSourceFile[]> => {
  await mkdir(SRC_DIR, { recursive: true });
  const sources: HeightmapSourceFile[] = [];
  for (const [key, content] of Object.entries(files)) {
    const p = join(SRC_DIR, key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, content);
    sources.push({ key, path: p });
  }
  return sources.sort((a, b) => a.key.localeCompare(b.key));
};

const readManifest = async (): Promise<{ schemaVersion: number; hash: string }> =>
  JSON.parse(await readFile(MANIFEST_PATH, 'utf-8'));

describe('heightmap-cache', () => {
  beforeEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true });
    await rm(SRC_DIR, { recursive: true, force: true });
  });

  it('writes then serves a cached hit with the manifest hash', async () => {
    const sources = await writeSources({ 'a.trn': 'aaa', 'b.dat': 'bbb' });
    const world = makeWorld(7);
    await writeHeightmapCache(CACHE_DIR, world, sources, STATS);

    const manifest = await readManifest();
    expect(manifest.schemaVersion).toBe(2); // literal on purpose — pins the on-disk contract

    const hit = await readHeightmapCache(CACHE_DIR, sources);
    expect(hit?.status).toBe('cached');
    expect(hit?.hash).toBe(manifest.hash);
    expect(Array.from(hit!.world.slice(0, 4))).toEqual([7, 7, 7, 7]);
    expect(hit!.world.byteLength).toBe(HEIGHTMAP_SIZE);
  });

  it('mtime-drift: touched mtimes with identical content refresh the manifest and serve', async () => {
    const sources = await writeSources({ 'a.trn': 'aaa', 'b.dat': 'bbb' });
    await writeHeightmapCache(CACHE_DIR, makeWorld(3), sources, STATS);

    const future = new Date(Date.now() + 10_000);
    for (const s of sources) await utimes(s.path, future, future);

    const hit = await readHeightmapCache(CACHE_DIR, sources);
    expect(hit?.status).toBe('mtime-drift');
    expect(Array.from(hit!.world.slice(0, 4))).toEqual([3, 3, 3, 3]);
  });

  it('real content change is a miss', async () => {
    const sources = await writeSources({ 'a.trn': 'aaa', 'b.dat': 'bbb' });
    await writeHeightmapCache(CACHE_DIR, makeWorld(1), sources, STATS);

    await writeFile(join(SRC_DIR, 'a.trn'), 'different-content');
    expect(await readHeightmapCache(CACHE_DIR, sources)).toBeNull();
  });

  it('added/removed source files are a miss', async () => {
    const sources = await writeSources({ 'a.trn': 'aaa', 'b.dat': 'bbb' });
    await writeHeightmapCache(CACHE_DIR, makeWorld(1), sources, STATS);

    const grown = await writeSources({ 'a.trn': 'aaa', 'b.dat': 'bbb', 'c.trn': 'ccc' });
    expect(await readHeightmapCache(CACHE_DIR, grown)).toBeNull();
  });

  it('corrupt blob (truncated) is a miss', async () => {
    const sources = await writeSources({ 'a.trn': 'aaa' });
    await writeHeightmapCache(CACHE_DIR, makeWorld(1), sources, STATS);

    await writeFile(BLOB_PATH, Buffer.alloc(1024));
    expect(await readHeightmapCache(CACHE_DIR, sources)).toBeNull();
  });

  it('blob whose bytes were swapped (hash mismatch) is a miss', async () => {
    const sources = await writeSources({ 'a.trn': 'aaa' });
    await writeHeightmapCache(CACHE_DIR, makeWorld(1), sources, STATS);

    await writeFile(BLOB_PATH, Buffer.from(makeWorld(2).buffer));
    expect(await readHeightmapCache(CACHE_DIR, sources)).toBeNull();
  });

  it('foreign schemaVersion manifest is a miss', async () => {
    const sources = await writeSources({ 'a.trn': 'aaa' });
    await writeHeightmapCache(CACHE_DIR, makeWorld(1), sources, STATS);

    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf-8'));
    manifest.schemaVersion = 99;
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest));
    expect(await readHeightmapCache(CACHE_DIR, sources)).toBeNull();
  });

  it('missing manifest is a miss', async () => {
    const sources = await writeSources({ 'a.trn': 'aaa' });
    expect(await readHeightmapCache(CACHE_DIR, sources)).toBeNull();
  });
});

describe('walkability-builder disk cache', () => {
  const writeBuilderFixtures = async (): Promise<void> => {
    await mkdir(join(BUILDER_SRC_ROOT, 'maps'), { recursive: true });
    await writeFile(join(BUILDER_SRC_ROOT, 'maps', 'Field0000.trn'), 'trn-bytes');
    await writeFile(join(BUILDER_SRC_ROOT, 'maps', 'Field0000.dat'), 'dat-bytes');
    await writeFile(join(BUILDER_SRC_ROOT, 'object.bin'), 'object-bytes');
    await writeFile(join(BUILDER_SRC_ROOT, 'AttributeMap.dat'), 'attr-bytes');
  };

  beforeEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true });
    await rm(BUILDER_SRC_ROOT, { recursive: true, force: true });
  });

  it('cold build persists the cache; a fresh boot serves it without touching the parsers', async () => {
    await writeBuilderFixtures();
    const modA = await import('@main/game-assets/walkability-builder');
    const { parseTrn } = await import('@main/game-assets/parsers/trn-parser');

    const w1 = await modA.buildWorldHeightmap();
    expect(vi.mocked(parseTrn).mock.calls.length).toBeGreaterThan(0);
    const h1 = modA.getHeightmapHash();

    // Simulate a process restart: fresh module registry, same disk state.
    vi.resetModules();
    vi.clearAllMocks();
    const modB = await import('@main/game-assets/walkability-builder');
    const { parseTrn: parseTrnB } = await import('@main/game-assets/parsers/trn-parser');
    const { loadAttributeMap: loadAttributeMapB } =
      await import('@main/game-assets/attribute-map-handler');

    const w2 = await modB.buildWorldHeightmap();
    expect(vi.mocked(parseTrnB).mock.calls.length).toBe(0);
    expect(modB.getHeightmapHash()).toBe(h1);
    expect(w2.byteLength).toBe(w1.byteLength);
    expect(
      Buffer.from(w2.buffer, w2.byteOffset, w2.byteLength).equals(
        Buffer.from(w1.buffer, w1.byteOffset, w1.byteLength),
      ),
    ).toBe(true);

    // Regression: a cache-hit early-return that skips `loadAttributeMap()` leaves
    // attribute-map-handler's module-level `cached` undefined and
    // `isZonePortalTile()` fail-closed for every tile — so every useZonePortal()
    // gets rejected with "skipped 0x290 — not on pad tile". The cache-hit branch
    // must still warm AttributeMap for the zone-portal gate.
    expect(vi.mocked(loadAttributeMapB).mock.calls.length).toBe(1);
  });

  it('a real source change rebuilds instead of serving the cache', async () => {
    await writeBuilderFixtures();
    const modA = await import('@main/game-assets/walkability-builder');
    await modA.buildWorldHeightmap();

    await writeFile(join(BUILDER_SRC_ROOT, 'maps', 'Field0000.trn'), 'changed-trn-bytes');
    vi.resetModules();
    vi.clearAllMocks();
    const modB = await import('@main/game-assets/walkability-builder');
    const { parseTrn: parseTrnB } = await import('@main/game-assets/parsers/trn-parser');

    await modB.buildWorldHeightmap();
    expect(vi.mocked(parseTrnB).mock.calls.length).toBeGreaterThan(0);
  });
});
