/**
 * Generates the platform app-icons electron-builder consumes (build/icon.ico,
 * build/icon.icns, build/icon.png) from the single source build/icon.svg.
 *
 * macOS-only: relies on `sips` (SVG raster + resize) and `iconutil` (.icns).
 * Run it whenever build/icon.svg changes, then commit the generated binaries —
 * the Windows/Linux CI runners consume them directly and never re-run this.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_DIR = fileURLToPath(new URL('../build', import.meta.url));
const SRC = join(BUILD_DIR, 'icon.svg');

// Windows .ico needs every size the shell renders at, from the taskbar (16) to
// large thumbnails (256). PNG-compressed entries (Vista+) keep the file small.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
// Apple iconset filename → pixel size. iconutil packs these into icon.icns.
const ICNS_VARIANTS: Array<[name: string, size: number]> = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

const tmp = mkdtempSync(join(tmpdir(), 'wyd-icons-'));

/** Raster the SVG (or downscale a PNG) to an exact square PNG via sips. */
const rasterize = (src: string, size: number): string => {
  const out = join(tmp, `px-${size}.png`);
  execFileSync('sips', [
    '-s',
    'format',
    'png',
    '-z',
    String(size),
    String(size),
    src,
    '--out',
    out,
  ]);
  return out;
};

/** Pack PNG buffers into a single multi-resolution .ico container. */
const buildIco = (entries: Array<{ size: number; png: Buffer }>): Buffer => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  for (const [i, { size, png }] of entries.entries()) {
    const e = dir.subarray(i * 16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 ⇒ 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 ⇒ 256)
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
  }
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
};

try {
  // Windows .ico
  const ico = buildIco(
    ICO_SIZES.map((size) => ({ size, png: readFileSync(rasterize(SRC, size)) })),
  );
  writeFileSync(join(BUILD_DIR, 'icon.ico'), ico);

  // Linux / generic fallback
  writeFileSync(join(BUILD_DIR, 'icon.png'), readFileSync(rasterize(SRC, 512)));

  // macOS .icns
  const iconset = join(tmp, 'icon.iconset');
  mkdirSync(iconset);
  for (const [name, size] of ICNS_VARIANTS) {
    writeFileSync(join(iconset, name), readFileSync(rasterize(SRC, size)));
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(BUILD_DIR, 'icon.icns')]);

  console.log('Generated build/icon.ico, build/icon.icns, build/icon.png from build/icon.svg');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
