import { access, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeRgbaPng } from '@main/lib';
import { IconCacheManager } from '@main/cache/icons';

vi.mock('@main/lib', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@main/lib')>();
  return { ...orig, encodeRgbaPng: vi.fn(orig.encodeRgbaPng) };
});

// Paths derive from the globally mocked app.getPath (tests/setup.ts) — no other
// suite may use this userData root without namespacing, or parallel runs collide.
const USER_DATA = join(tmpdir(), 'wydbot-test');
const STORE = join(USER_DATA, 'game-assets', 'v1');
const ICONS_DIR = join(STORE, 'Icons');
const CACHE_ROOT = join(USER_DATA, 'icons');
const PNG_DIR = join(CACHE_ROOT, 'v3', 'png');
const MANIFEST_PATH = join(CACHE_ROOT, 'v3', 'manifest.json');

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const makeItemIconBin = (entries: Record<number, number>): Buffer => {
  const buf = Buffer.alloc(6500 * 4);
  for (const [id, cell] of Object.entries(entries)) {
    buf.writeInt32LE(cell, Number(id) * 4);
  }
  return buf;
};

/** Minimal WT10 type-0x02 atlas (1000×1000×24bpp) with `cells` painted solid. */
const makeAtlas = (cells: { cellInPage: number; bgr: [number, number, number] }[]): Buffer => {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x30315457, 0); // 'WT10'
  header[6] = 0x02; // uncompressed RGB
  header.writeUInt16LE(1000, 16);
  header.writeUInt16LE(1000, 18);
  header[20] = 24;
  const pixels = Buffer.alloc(1000 * 1000 * 3);
  for (const { cellInPage, bgr } of cells) {
    const col = cellInPage % 10;
    const row = 9 - Math.floor(cellInPage / 10);
    const x0 = col * 100;
    const y0 = row * 100;
    for (let y = y0; y < y0 + 100; y++) {
      for (let x = x0; x < x0 + 100; x++) {
        const off = (y * 1000 + x) * 3;
        pixels[off] = bgr[0];
        pixels[off + 1] = bgr[1];
        pixels[off + 2] = bgr[2];
      }
    }
  }
  return Buffer.concat([header, pixels]);
};

const writeSources = async (bin: Buffer, atlases: Record<string, Buffer>): Promise<void> => {
  await mkdir(ICONS_DIR, { recursive: true });
  await writeFile(join(STORE, 'itemicon.bin'), bin);
  for (const [name, buf] of Object.entries(atlases)) {
    await writeFile(join(ICONS_DIR, name), buf);
  }
};

const readManifest = async (): Promise<{
  schemaVersion: number;
  items: Record<string, { cellIdx: number }>;
  unextractable?: Record<string, string>;
  stats: { itemsWithIcon: number };
}> => JSON.parse(await readFile(MANIFEST_PATH, 'utf-8'));

const atlas01 = () => makeAtlas([{ cellInPage: 4, bgr: [10, 20, 30] }]);
const atlas02 = () => makeAtlas([{ cellInPage: 4, bgr: [40, 50, 60] }]);
const atlas92 = () => makeAtlas([{ cellInPage: 0, bgr: [70, 80, 90] }]);

describe('IconCacheManager', () => {
  beforeEach(async () => {
    await rm(CACHE_ROOT, { recursive: true, force: true });
    await rm(STORE, { recursive: true, force: true });
  });

  it('cold-extracts an honest manifest (only written ids) + PNGs', async () => {
    await writeSources(makeItemIconBin({ 10: 5, 5224: 9101 }), {
      'itemicon01.wyt': atlas01(),
      'itemicon92.wyt': atlas92(),
    });
    const res = await new IconCacheManager().initialize();
    expect(res.status).toBe('cold-extract');
    expect(res.iconsExtracted).toBe(2);
    const manifest = await readManifest();
    // Literal on purpose: pins the on-disk contract — a SCHEMA_VERSION bump
    // must fail here loudly, never be absorbed by importing the constant.
    expect(manifest.schemaVersion).toBe(3);
    expect(Object.keys(manifest.items).sort()).toEqual(['00010', '05224']);
    expect(manifest.stats.itemsWithIcon).toBe(2);
    expect(await fileExists(join(PNG_DIR, '00010.png'))).toBe(true);
    expect(await fileExists(join(PNG_DIR, '05224.png'))).toBe(true);
    expect(await new IconCacheManager().getAvailableIconIds()).toEqual(new Set([10, 5224]));
  });

  it('whenReady waiters attached before the first initialize are never stranded', async () => {
    await writeSources(makeItemIconBin({ 10: 5 }), { 'itemicon01.wyt': atlas01() });
    const manager = new IconCacheManager();
    // The ItemDb IPC handler attaches exactly like this when the renderer's
    // early invoke beats the boot's first initialize() — without waiter support
    // this dead-ends the charlist "Entrar" (hung `data:get-item-db`).
    const waiter = manager.whenReady();
    await manager.initialize();
    await expect(waiter).resolves.toBeUndefined();
  });

  it('whenReady waiters survive a failed first initialize and resolve on retry', async () => {
    const manager = new IconCacheManager();
    const waiter = manager.whenReady();
    // No sources at all → discoverSources throws → waiter stays pending.
    await expect(manager.initialize()).rejects.toThrow();

    await writeSources(makeItemIconBin({ 10: 5 }), { 'itemicon01.wyt': atlas01() });
    await manager.initialize();
    await expect(waiter).resolves.toBeUndefined();
  });

  it('second boot with untouched sources is a Tier-0 cached hit', async () => {
    await writeSources(makeItemIconBin({ 10: 5 }), { 'itemicon01.wyt': atlas01() });
    await new IconCacheManager().initialize();
    const res = await new IconCacheManager().initialize();
    expect(res.status).toBe('cached');
    expect(res.iconsExtracted).toBe(0);
  });

  it('negative-caches atlas-missing items: cached hit next boot, heals when the atlas appears', async () => {
    // item 20 → cell 405 → page 5, but itemicon05.wyt is absent.
    await writeSources(makeItemIconBin({ 10: 5, 20: 405 }), { 'itemicon01.wyt': atlas01() });
    const cold = await new IconCacheManager().initialize();
    expect(cold.status).toBe('cold-extract');
    let manifest = await readManifest();
    expect(Object.keys(manifest.items)).toEqual(['00010']);
    expect(manifest.unextractable).toEqual({ '00020': 'atlas-missing' });

    // Same sources: the known-missing id is tolerated by Tier-0 completeness —
    // no re-decode, no re-hash, straight cached hit.
    const retry = await new IconCacheManager().initialize();
    expect(retry.status).toBe('cached');
    expect(retry.iconsExtracted).toBe(0);

    // The atlas shows up → the fingerprint diff marks it dirty and the pending
    // item heals, leaving `unextractable`.
    await writeFile(
      join(ICONS_DIR, 'itemicon05.wyt'),
      makeAtlas([{ cellInPage: 4, bgr: [1, 2, 3] }]),
    );
    const healed = await new IconCacheManager().initialize();
    expect(healed.status).toBe('delta-extract');
    expect(healed.iconsExtracted).toBe(1);
    manifest = await readManifest();
    expect(Object.keys(manifest.items).sort()).toEqual(['00010', '00020']);
    expect(manifest.unextractable).toEqual({});
    expect(await fileExists(join(PNG_DIR, '00020.png'))).toBe(true);
  });

  it('self-migrates a legacy v3 manifest (no unextractable field): one delta, then cached', async () => {
    await writeSources(makeItemIconBin({ 10: 5, 20: 405 }), { 'itemicon01.wyt': atlas01() });
    await new IconCacheManager().initialize();
    // Simulate a manifest written before the field existed.
    const legacy = JSON.parse(await readFile(MANIFEST_PATH, 'utf-8'));
    delete legacy.unextractable;
    await writeFile(MANIFEST_PATH, JSON.stringify(legacy));

    const migrating = await new IconCacheManager().initialize();
    expect(migrating.status).toBe('delta-extract');
    expect(migrating.iconsExtracted).toBe(0);
    expect((await readManifest()).unextractable).toEqual({ '00020': 'atlas-missing' });

    const settled = await new IconCacheManager().initialize();
    expect(settled.status).toBe('cached');
  });

  it('moves a remapped-to-missing-atlas id into unextractable and keeps its stale PNG', async () => {
    await writeSources(makeItemIconBin({ 10: 5 }), { 'itemicon01.wyt': atlas01() });
    await new IconCacheManager().initialize();
    expect(await fileExists(join(PNG_DIR, '00010.png'))).toBe(true);

    // bin remaps item 10 page 1 → page 5 (no itemicon05.wyt on disk).
    await writeFile(join(STORE, 'itemicon.bin'), makeItemIconBin({ 10: 405 }));
    const res = await new IconCacheManager().initialize();
    expect(res.status).toBe('delta-extract');
    expect(res.iconsExtracted).toBe(0);
    const manifest = await readManifest();
    expect(manifest.items['00010']).toBeUndefined();
    expect(manifest.unextractable).toEqual({ '00010': 'atlas-missing' });
    // Mapped-but-unextractable keeps the stale-but-renderable PNG on disk.
    expect(await fileExists(join(PNG_DIR, '00010.png'))).toBe(true);

    const settled = await new IconCacheManager().initialize();
    expect(settled.status).toBe('cached');
  });

  it('re-extracts items remapped by itemicon.bin into a CLEAN atlas (no atlas dirty)', async () => {
    await writeSources(makeItemIconBin({ 10: 5 }), {
      'itemicon01.wyt': atlas01(),
      'itemicon02.wyt': atlas02(),
    });
    await new IconCacheManager().initialize();

    // bin moves item 10 page 1 → page 2; atlas files byte-identical.
    await writeFile(join(STORE, 'itemicon.bin'), makeItemIconBin({ 10: 105 }));
    const res = await new IconCacheManager().initialize();
    expect(res.status).toBe('delta-extract');
    expect(res.iconsExtracted).toBe(1);
    const manifest = await readManifest();
    expect(manifest.items['00010']?.cellIdx).toBe(105);
  });

  it('removes orphan PNGs and stale .tmp parts after an extract', async () => {
    await writeSources(makeItemIconBin({ 10: 5, 11: 6 }), { 'itemicon01.wyt': atlas01() });
    await new IconCacheManager().initialize();
    expect(await fileExists(join(PNG_DIR, '00011.png'))).toBe(true);

    // item 11 loses its icon (cell → 0 ⇒ absent from the bin); plant junk too.
    await writeFile(join(STORE, 'itemicon.bin'), makeItemIconBin({ 10: 5 }));
    await writeFile(join(PNG_DIR, '00099.png'), 'stale');
    await writeFile(join(PNG_DIR, '00010.png.tmp'), 'partial');
    const res = await new IconCacheManager().initialize();
    expect(res.status).toBe('delta-extract');
    expect(await fileExists(join(PNG_DIR, '00010.png'))).toBe(true);
    expect(await fileExists(join(PNG_DIR, '00011.png'))).toBe(false);
    expect(await fileExists(join(PNG_DIR, '00099.png'))).toBe(false);
    expect(await fileExists(join(PNG_DIR, '00010.png.tmp'))).toBe(false);
    const manifest = await readManifest();
    expect(Object.keys(manifest.items)).toEqual(['00010']);
  });

  it.each([1, 2])('rejects a v%i manifest and re-extracts cold', async (schemaVersion) => {
    await writeSources(makeItemIconBin({ 10: 5 }), { 'itemicon01.wyt': atlas01() });
    await new IconCacheManager().initialize();
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf-8'));
    manifest.schemaVersion = schemaVersion;
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest));

    const res = await new IconCacheManager().initialize();
    expect(res.status).toBe('cold-extract');
    expect(res.iconsExtracted).toBe(1);
  });

  it('keeps a per-cell write failure OUT of the manifest and heals it next boot', async () => {
    await writeSources(makeItemIconBin({ 10: 5, 11: 6 }), { 'itemicon01.wyt': atlas01() });
    vi.mocked(encodeRgbaPng).mockRejectedValueOnce(new Error('boom'));
    const cold = await new IconCacheManager().initialize();
    expect(cold.status).toBe('cold-extract');
    expect(cold.iconsExtracted).toBe(1);
    const manifest = await readManifest();
    expect(Object.keys(manifest.items)).toHaveLength(1);
    // Transient failures are NOT negative-cached — they retry every boot.
    expect(manifest.unextractable).toEqual({});

    // Encode works again → the failed id is re-tried via Tier-0 completeness.
    const healed = await new IconCacheManager().initialize();
    expect(healed.status).toBe('delta-extract');
    expect(healed.iconsExtracted).toBe(1);
    expect(Object.keys((await readManifest()).items).sort()).toEqual(['00010', '00011']);
  });

  it('refreshes mtimes only (mtime-drift) when content is unchanged', async () => {
    await writeSources(makeItemIconBin({ 10: 5 }), { 'itemicon01.wyt': atlas01() });
    await new IconCacheManager().initialize();

    const binPath = join(STORE, 'itemicon.bin');
    await writeFile(binPath, makeItemIconBin({ 10: 5 }));
    const future = new Date(Date.now() + 10_000);
    await utimes(binPath, future, future);

    const res = await new IconCacheManager().initialize();
    expect(res.status).toBe('mtime-drift');
    expect(res.iconsExtracted).toBe(0);
  });
});
