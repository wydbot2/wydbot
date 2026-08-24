import { describe, expect, it } from 'vitest';

import { cellRectInPage, extractCellRgba, ICON_GRID } from '@main/cache/icons/cell-extractor';
import type { WytAtlas } from '@main/game-assets/parsers';

/**
 * Atlas with two marked bands: file rows 0-99 painted RED, file rows 990-999
 * painted BLUE. The 10-row blue band is NARROWER than a cell so the corner
 * pixel distinguishes "grid-row flip + per-cell flip" (correct) from
 * "grid-row flip only" (bug: output (0,0) would read the unpainted row 900).
 */
const makeAtlas = (topDown: boolean): WytAtlas => {
  const pixels = Buffer.alloc(1000 * 1000 * 4);
  const paint = (y0: number, rows: number, bgr: [number, number, number]) => {
    for (let y = y0; y < y0 + rows; y++) {
      for (let x = 0; x < 1000; x++) {
        const off = (y * 1000 + x) * 4;
        pixels[off] = bgr[0];
        pixels[off + 1] = bgr[1];
        pixels[off + 2] = bgr[2];
        pixels[off + 3] = 255;
      }
    }
  };
  paint(0, 100, [0, 0, 255]); // file top rows: red (BGRA)
  paint(990, 10, [255, 0, 0]); // file bottom 10 rows: blue (BGRA)
  return { width: 1000, height: 1000, pixels, topDown };
};

const px00 = (rgba: Buffer): [number, number, number, number] => [
  rgba[0],
  rgba[1],
  rgba[2],
  rgba[3],
];
const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

describe('cell-extractor orientation (TGA descriptor bit 0x20)', () => {
  it('bottom-up atlas: cell 0 reads the FILE BOTTOM rows, flipped', () => {
    const rect = cellRectInPage(ICON_GRID, 0, false);
    expect(rect).toEqual({ x: 0, y: 900, w: 100, h: 100 });
    expect(px00(extractCellRgba(ICON_GRID, makeAtlas(false), 0))).toEqual(BLUE);
  });

  it('top-down atlas: cell 0 reads the FILE TOP rows, no flip', () => {
    const rect = cellRectInPage(ICON_GRID, 0, true);
    expect(rect).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(px00(extractCellRgba(ICON_GRID, makeAtlas(true), 0))).toEqual(RED);
  });

  it('grid row band follows orientation for cellInPage 10', () => {
    expect(cellRectInPage(ICON_GRID, 10, false).y).toBe(800);
    expect(cellRectInPage(ICON_GRID, 10, true).y).toBe(100);
  });

  it('rejects a resized atlas (fail-visible instead of silently mis-slicing)', () => {
    const resized: WytAtlas = {
      width: 2000,
      height: 2000,
      pixels: Buffer.alloc(2000 * 2000 * 4),
      topDown: false,
    };
    expect(() => extractCellRgba(ICON_GRID, resized, 0)).toThrow(/geometry changed/);
    const offByOne: WytAtlas = { ...resized, width: 1001, height: 1000 };
    expect(() => extractCellRgba(ICON_GRID, offByOne, 0)).toThrow(/geometry changed/);
  });
});
