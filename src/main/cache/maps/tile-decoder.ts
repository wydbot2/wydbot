import type { WytAtlas } from '@main/game-assets/parsers';

const TILE_SIZE = 128;

export const decodeMapTileRgba = (atlas: WytAtlas): Buffer => {
  if (atlas.width !== TILE_SIZE || atlas.height !== TILE_SIZE) {
    throw new Error(
      `Map tile size mismatch: ${atlas.width}×${atlas.height} (expected ${TILE_SIZE}×${TILE_SIZE})`,
    );
  }
  const rgba = Buffer.allocUnsafe(TILE_SIZE * TILE_SIZE * 4);
  // Atlas is BGRA bottom-up (TGA standard); pure black → α=0 so void areas show the canvas background.
  for (let y = 0; y < TILE_SIZE; y++) {
    const srcY = TILE_SIZE - 1 - y;
    for (let x = 0; x < TILE_SIZE; x++) {
      const src = (srcY * TILE_SIZE + x) * 4;
      const dst = (y * TILE_SIZE + x) * 4;
      const b = atlas.pixels[src];
      const g = atlas.pixels[src + 1];
      const r = atlas.pixels[src + 2];
      const a = atlas.pixels[src + 3];
      rgba[dst] = r;
      rgba[dst + 1] = g;
      rgba[dst + 2] = b;
      rgba[dst + 3] = r === 0 && g === 0 && b === 0 ? 0 : a;
    }
  }
  return rgba;
};
