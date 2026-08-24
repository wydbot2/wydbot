/**
 * Parser for `resources/MountData.bin`.
 *
 *   - 70000 bytes payload + 4-byte checksum trailer.
 *   - XOR every payload byte with 0x5A.
 *   - 500 rows × 0x8C (140) bytes.
 *
 * Row offsets:
 *   +0x00 u32  rowField0x00  index echo
 *   +0x1C u32  baseHp        base mount HP cap
 *   +0x20 u32  damage        physical damage (mount adult/special)
 *   +0x24 u32  magic         magic damage (mount adult/special)
 *   +0x28 u32  evasion       flat evasion (mount-special only)
 *   +0x2C u32  resistAll     flat all-resist (mount-special only)
 *   +0x30 u32  mountSancOverride (clamped 0..6, packed into refine grade)
 *   +0x04..+0x18, +0x34, +0x38: server-side params (no shipped-client consumer)
 *
 * Unknown: +0x3C..+0x8B 4×u16[10] grid banks (only bank A consumed via
 */

import { detectRecordLayout } from './asset-format-error';

// Row stride varies by client build: 140 (legacy bundled) vs 136 (RaidHut Global). Detect from size.
const ROW_STRIDES = [136, 140] as const;
const GRID_END = 0x8c; // bank A..D end; clamped to row stride for shorter (Global) rows
const TRAILER_SIZES = [0, 4] as const;
const XOR_KEY = 0x5a;
/** OOM guard: mount table is 500 rows. */
const MAX_MOUNT_ROWS = 8192;

export interface MountDataRow {
  /** 0..499 — index in the table. */
  index: number;
  /** Row+0x00 u32: echoed index/key (sanity check). */
  rowField0x00: number;
  /** Row+0x1C u32: confirmed base mount HP cap. 0 = use 7000 fallback. */
  baseHp: number;
  damage: number;
  /** Row+0x24 u32: magic damage. */
  magic: number;
  /** Row+0x28 u32: flat evasion (mount-special only). */
  evasion: number;
  /** Row+0x2C u32: flat all-resist (mount-special only). */
  resistAll: number;
  mountSancOverride: number;
  /** Full 140-byte decrypted row, for any reinterpretation later. */
  rawRow: Buffer;
  grid3CTo8A: Buffer;
}

/**
 * Parse a MountData.bin file buffer into typed rows.
 *
 * Auto-detects stride (140 legacy / 136 Global) and row count from the file
 * length, with an optional 4-byte trailer dropped without checksum validation.
 * If a length divides by BOTH strides it throws `ambiguous-stride` rather than
 * silently picking one and serving wrong mount HP/damage.
 */
export const parseMountDataBin = (buffer: Buffer): MountDataRow[] => {
  const {
    width: stride,
    count: rowCount,
    payloadSize,
  } = detectRecordLayout(buffer, {
    asset: 'MountData.bin',
    widths: ROW_STRIDES,
    trailers: TRAILER_SIZES,
    maxCount: MAX_MOUNT_ROWS,
    minCount: 1,
  });
  const gridEnd = Math.min(GRID_END, stride);

  const decrypted = Buffer.alloc(payloadSize);
  for (let i = 0; i < payloadSize; i++) {
    decrypted[i] = buffer[i] ^ XOR_KEY;
  }

  const rows: MountDataRow[] = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const start = i * stride;
    const rawRow = Buffer.from(decrypted.subarray(start, start + stride));
    rows[i] = {
      index: i,
      rowField0x00: rawRow.readUInt32LE(0x00),
      baseHp: rawRow.readUInt32LE(0x1c),
      damage: rawRow.readUInt32LE(0x20),
      magic: rawRow.readUInt32LE(0x24),
      evasion: rawRow.readUInt32LE(0x28),
      resistAll: rawRow.readUInt32LE(0x2c),
      mountSancOverride: rawRow.readUInt32LE(0x30),
      rawRow,
      grid3CTo8A: Buffer.from(rawRow.subarray(0x3c, gridEnd)),
    };
  }
  return rows;
};
