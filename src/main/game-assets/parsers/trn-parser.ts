const GRID_DIM = 64;
const CELL_STRIDE = 12;
const GRID_BYTES = GRID_DIM * GRID_DIM * CELL_STRIDE; // 0xC000
const CELL_COUNT = GRID_DIM * GRID_DIM;

export interface TrnCell {
  /** i8 height; the only field walkability consults (slope test, tolerance ±8). */
  height: number;
  tileA: number;
  tileB: number;
  /** byte[4]; unconfirmed flag/wall mask, retained for future RE. */
  flagsByte: number;
  rgb: [number, number, number];
}

export interface ParsedTrn {
  /** "" or "Field" (lowercase variants observed). */
  name: string;
  /** Header sector coordinate (sectorX, sectorY) as stored in the file. */
  sectorCoord: [number, number];
  /** 64×64 row-major. `cells[row * 64 + col]`. */
  cells: TrnCell[];
  /** Flat view of `cells[i].height`; length 4096. The pathfinder input. */
  heights: Int8Array;
}

export const parseTrn = (buf: Buffer): ParsedTrn => {
  const nameLen = buf.readUInt8(0);
  if (nameLen !== 0 && nameLen !== 5) {
    throw new Error(`trn: invalid nameLen=${nameLen} (expected 0 or 5); file size=${buf.length}`);
  }

  const expectedSize = 1 + nameLen + 2 + GRID_BYTES;
  if (buf.length !== expectedSize) {
    throw new Error(
      `trn: truncated or oversized — got ${buf.length} bytes, expected ${expectedSize} (nameLen=${nameLen})`,
    );
  }

  const name = nameLen === 0 ? '' : buf.toString('ascii', 1, 1 + nameLen);
  const sectorX = buf.readUInt8(1 + nameLen);
  const sectorY = buf.readUInt8(2 + nameLen);

  const gridOffset = 3 + nameLen;
  const cells: TrnCell[] = new Array(CELL_COUNT);
  const heights = new Int8Array(CELL_COUNT);

  for (let i = 0; i < CELL_COUNT; i++) {
    const off = gridOffset + i * CELL_STRIDE;
    // Disk height of exactly +127 is a legitimate real-terrain value (e.g. Field0815.trn cells 3-4),
    // distinct from the loader-injected `0x7F` seam sentinel that lives in a separate runtime buffer.
    const h = buf.readInt8(off);
    heights[i] = h;
    cells[i] = {
      height: h,
      tileA: buf.readUInt8(off + 1),
      tileB: buf.readUInt8(off + 2),
      flagsByte: buf.readUInt8(off + 4),
      rgb: [buf.readUInt8(off + 8), buf.readUInt8(off + 9), buf.readUInt8(off + 10)],
    };
  }

  return { name, sectorCoord: [sectorX, sectorY], cells, heights };
};
