/**
 * Parser for `resources/MountDataV.bin`.
 *
 *   - N rows × 0x1C (28) bytes + optional 4-byte checksum trailer (ignored).
 *   - XOR every payload byte with 0x5A.
 *   - Row count derives from length (500 legacy bundled / 200 RaidHut Global).
 *
 * Indexing key: ItemList row +0x40 (mountVKey, u16 LE).
 * NOTE: differs from MountData.bin which is keyed by ItemList row +0x9A
 * (mountIndex). The two tables are independent lookups from different fields
 * of the same ItemList row. Caller must bounds-check `mountVKey < 500`.
 */

import { AssetFormatError } from './asset-format-error';

export interface MountDataVRow {
  /** +0x00 i16 — mount class / grade. */
  mountClass: number;
  /** +0x02..+0x0C — 6 × i16 effect-slot fields (entity+0x136..+0x140). */
  effectField0: number;
  effectField1: number;
  effectField2: number;
  effectField3: number;
  effectField4: number;
  effectField5: number;
  /** +0x0E..+0x12 — 3 × i16 slot color/bonus (-1 sentinel = unused). */
  slotColor0: number;
  slotColor1: number;
  slotColor2: number;
  scaleRatio: number;
  /** +0x18 i16 — refine-bonus index. */
  refineBonusIndex: number;
  /** +0x1A i16 — written by client, never read. Preserved verbatim. */
  unusedTrailing: number;
}

const ROW_SIZE = 0x1c;
const XOR_KEY = 0x5a;
/** OOM guard: real table is 500 rows. */
const MAX_ROWS = 16384;

export const parseMountDataVBin = (buffer: Buffer): MountDataVRow[] => {
  // Row count derives from length; a trailing partial (e.g. 4-byte checksum) is dropped.
  const rowCount = Math.floor(buffer.length / ROW_SIZE);
  if (rowCount < 1) {
    throw new AssetFormatError(
      'MountDataV.bin',
      'empty',
      `≥ ${ROW_SIZE} bytes`,
      `${buffer.length} bytes`,
    );
  }
  if (rowCount > MAX_ROWS) {
    throw new AssetFormatError(
      'MountDataV.bin',
      'implausible-count',
      `≤ ${MAX_ROWS} rows`,
      `${rowCount} rows`,
    );
  }
  const payloadSize = rowCount * ROW_SIZE;

  const decrypted = Buffer.allocUnsafe(payloadSize);
  for (let i = 0; i < payloadSize; i++) {
    decrypted[i] = buffer[i] ^ XOR_KEY;
  }

  const rows: MountDataVRow[] = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const o = i * ROW_SIZE;
    rows[i] = {
      mountClass: decrypted.readInt16LE(o + 0x00),
      effectField0: decrypted.readInt16LE(o + 0x02),
      effectField1: decrypted.readInt16LE(o + 0x04),
      effectField2: decrypted.readInt16LE(o + 0x06),
      effectField3: decrypted.readInt16LE(o + 0x08),
      effectField4: decrypted.readInt16LE(o + 0x0a),
      effectField5: decrypted.readInt16LE(o + 0x0c),
      slotColor0: decrypted.readInt16LE(o + 0x0e),
      slotColor1: decrypted.readInt16LE(o + 0x10),
      slotColor2: decrypted.readInt16LE(o + 0x12),
      scaleRatio: decrypted.readFloatLE(o + 0x14),
      refineBonusIndex: decrypted.readInt16LE(o + 0x18),
      unusedTrailing: decrypted.readInt16LE(o + 0x1a),
    };
  }
  return rows;
};
