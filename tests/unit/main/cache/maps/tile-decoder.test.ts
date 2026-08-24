import { describe, expect, it } from 'vitest';

import { decodeMapTileRgba } from '@main/cache/maps/tile-decoder';
import type { WytAtlas } from '@main/game-assets/parsers';

/** 2×2 BGRA atlas used only for the geometry-guard assert. */
const makeTinyAtlas = (): WytAtlas => ({
  width: 2,
  height: 2,
  topDown: false,
  pixels: Buffer.alloc(2 * 2 * 4),
});

/** 128×128 BGRA bottom-up atlas with marked corners (file row 0 = image bottom). */
const makeTileAtlas = (): WytAtlas => {
  const pixels = Buffer.alloc(128 * 128 * 4);
  const stampImage = (x: number, yImage: number, bgra: [number, number, number, number]) => {
    const yFile = 127 - yImage; // bottom-up: file row 0 = image bottom
    pixels.set(bgra, (yFile * 128 + x) * 4);
  };
  stampImage(0, 127, [0, 0, 255, 255]); // image bottom-left: red
  stampImage(127, 127, [0, 255, 0, 200]); // image bottom-right: green a=200
  stampImage(0, 0, [255, 0, 0, 255]); // image top-left: blue
  stampImage(127, 0, [0, 0, 0, 255]); // image top-right: black opaque
  return { width: 128, height: 128, pixels, topDown: false };
};

const px = (rgba: Buffer, x: number, y: number): number[] => {
  const off = (y * 128 + x) * 4;
  return [rgba[off], rgba[off + 1], rgba[off + 2], rgba[off + 3]];
};

describe('decodeMapTileRgba — synthetic', () => {
  it('flips bottom-up rows and maps BGRA → RGBA', () => {
    const rgba = decodeMapTileRgba(makeTileAtlas());
    expect(px(rgba, 0, 0)).toEqual([0, 0, 255, 255]); // canvas top-left = image top-left (blue)
    expect(px(rgba, 0, 127)).toEqual([255, 0, 0, 255]); // canvas bottom-left = image bottom-left (red)
    expect(px(rgba, 127, 127)).toEqual([0, 255, 0, 200]); // source alpha preserved on non-black
  });

  it('applies the chroma-key rule (pure black → alpha 0) over source alpha', () => {
    const rgba = decodeMapTileRgba(makeTileAtlas());
    expect(px(rgba, 127, 0)).toEqual([0, 0, 0, 0]); // black opaque in source → transparent
  });

  it('rejects non-128×128 geometry', () => {
    expect(() => decodeMapTileRgba(makeTinyAtlas())).toThrow(/Map tile size mismatch/);
  });
});
