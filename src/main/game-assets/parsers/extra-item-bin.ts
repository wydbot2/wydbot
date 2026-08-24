/**
 * Parser for `resources/extraitem.bin`.
 *
 *   - No header, no footer, no checksum, NO encryption.
 *   - Stream of 0xAA-byte records: { int16 itemId; uint8 row[0xA8]; }
 *   - Records with id outside [1, 0x1963) are flagged but not crashed on.
 *   - Each record is a full row replacement for ItemList.bin's row at the
 *     same id (last-write-wins).
 */

import { detectRecordLayout, type DetectedLayout } from './asset-format-error';
import { ITEM_ROW_WIDTHS } from './item-list-bin';
import { parseItemRow, type ItemRow } from './item-row';

// Record = i16 id header + an item row, so record size = 2 + each append-safe row width.
const RECORD_SIZES = ITEM_ROW_WIDTHS.map((w) => w + 2);
export const ID_MAX_EXCLUSIVE = 0x1963; // 6499
/** OOM guard — extraitem overlays number in the low thousands. */
const MAX_RECORDS = 65536;

export interface ExtraItemRecord {
  /** Item id (int16) read from the record header. */
  id: number;
  /** Raw 168-byte row payload. */
  rowBytes: Buffer;
  /** Parsed projection of rowBytes. */
  rowParsed: ItemRow;
}

export interface ExtraItemParseResult {
  records: ExtraItemRecord[];
  /** Records whose id fell outside [1, 0x1963). */
  skipped: { id: number; offset: number }[];
}

/** Disambiguation (only when >1 record size divides): most records must carry a valid id. */
const idsLookValid = (buf: Buffer, layout: DetectedLayout): boolean => {
  const sample = Math.min(layout.count, 64);
  let valid = 0;
  for (let i = 0; i < sample; i++) {
    const id = buf.readInt16LE(i * layout.width);
    if (id >= 1 && id < ID_MAX_EXCLUSIVE) valid++;
  }
  return valid >= sample * 0.75;
};

export const parseExtraItemBin = (buffer: Buffer): ExtraItemParseResult => {
  const { width: recordSize, count } = detectRecordLayout(buffer, {
    asset: 'extraitem.bin',
    widths: RECORD_SIZES,
    maxCount: MAX_RECORDS,
    minCount: 1,
    plausible: idsLookValid,
  });

  const records: ExtraItemRecord[] = [];
  const skipped: { id: number; offset: number }[] = [];

  for (let i = 0; i < count; i++) {
    const off = i * recordSize;
    const id = buffer.readInt16LE(off);
    // Canonical id bound `((ushort)(id-1) < 0x1963)` ⇔ 1 ≤ id ≤ 6498.
    if (id < 1 || id >= ID_MAX_EXCLUSIVE) {
      skipped.push({ id, offset: off });
      continue;
    }
    const rowBytes = Buffer.from(buffer.subarray(off + 2, off + recordSize));
    records.push({ id, rowBytes, rowParsed: parseItemRow(rowBytes) });
  }

  return { records, skipped };
};
