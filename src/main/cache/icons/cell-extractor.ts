import type { WytAtlas } from '@main/game-assets/parsers';

export interface GridSpec {
  cellSize: number;
  gridWidth: number;
  gridHeight: number;
  cellsPerPage: number;
  /** Per-page filename builder. `pageIdx0` is 0-based. */
  atlasFileName: (pageIdx0: number) => string;
}

export const ICON_GRID: GridSpec = {
  cellSize: 100,
  gridWidth: 10,
  gridHeight: 10,
  cellsPerPage: 100,
  atlasFileName: (page0) => `itemicon${String(page0 + 1).padStart(2, '0')}.wyt`,
};

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Orientation comes from the atlas descriptor (WytAtlas.topDown): bottom-up
// atlases invert the grid row AND each cell (the two flips compose to a single
// whole-image inversion); top-down atlases are read as-is.
export const cellRectInPage = (
  spec: GridSpec,
  cellIdx0Based: number,
  topDown: boolean,
): CellRect => {
  const cellInPage = cellIdx0Based % spec.cellsPerPage;
  const gridCol = cellInPage % spec.gridWidth;
  const gridRow = topDown
    ? Math.floor(cellInPage / spec.gridWidth)
    : spec.gridHeight - 1 - Math.floor(cellInPage / spec.gridWidth);
  return {
    x: gridCol * spec.cellSize,
    y: gridRow * spec.cellSize,
    w: spec.cellSize,
    h: spec.cellSize,
  };
};

export const atlasNumForCell = (spec: GridSpec, cellIdx0Based: number): number =>
  Math.floor(cellIdx0Based / spec.cellsPerPage) + 1;

export const atlasFileNameForCell = (spec: GridSpec, cellIdx0Based: number): string =>
  spec.atlasFileName(Math.floor(cellIdx0Based / spec.cellsPerPage));

export const extractCellRgba = (spec: GridSpec, atlas: WytAtlas, cellIdx0Based: number): Buffer => {
  // Fail-visible geometry guard: a resized atlas must throw instead of silently
  // mis-slicing the grid — callers that catch per-cell (the icon cache) then
  // skip the cell, omit it from the manifest, and retry it on the next boot.
  const expectedW = spec.gridWidth * spec.cellSize;
  const expectedH = spec.gridHeight * spec.cellSize;
  if (atlas.width !== expectedW || atlas.height !== expectedH) {
    throw new Error(
      `Atlas geometry changed: ${atlas.width}×${atlas.height} ` +
        `(expected ${expectedW}×${expectedH} for a ${spec.gridWidth}×${spec.gridHeight} grid of ${spec.cellSize}px cells)`,
    );
  }

  const { x, y, w, h } = cellRectInPage(spec, cellIdx0Based, atlas.topDown);

  if (x + w > atlas.width || y + h > atlas.height) {
    throw new Error(
      `Cell ${cellIdx0Based} out of atlas bounds: rect=(${x},${y},${w},${h}) ` +
        `atlas=${atlas.width}×${atlas.height}`,
    );
  }

  const rgba = Buffer.allocUnsafe(w * h * 4);
  for (let dy = 0; dy < h; dy++) {
    const srcY = atlas.topDown ? y + dy : y + (h - 1 - dy);
    const srcRow = srcY * atlas.width;
    const dstRow = dy * w;
    for (let dx = 0; dx < w; dx++) {
      const srcOff = (srcRow + (x + dx)) * 4;
      const dstOff = (dstRow + dx) * 4;
      // Atlas is BGRA (TGA channel order); reorder to RGB. Pure black → α=0.
      const b = atlas.pixels[srcOff];
      const g = atlas.pixels[srcOff + 1];
      const r = atlas.pixels[srcOff + 2];
      const a = atlas.pixels[srcOff + 3];
      rgba[dstOff] = r;
      rgba[dstOff + 1] = g;
      rgba[dstOff + 2] = b;
      rgba[dstOff + 3] = r === 0 && g === 0 && b === 0 ? 0 : a;
    }
  }
  return rgba;
};
