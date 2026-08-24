/**
 * Parser for `resources/ItemList.bin`.
 *
 *   - File = N rows × width bytes payload + optional 4-byte checksum trailer.
 *   - Decryption: XOR every payload byte with 0x5A.
 *   - Trailing 4-byte checksum is skipped here (not validated).
 *
 * Row width AND row count are DERIVED from the file size, never hardcoded: this
 * table grows by appending fields, so a wider row still parses at the same
 * offsets. A width is trusted only if it is on the append-safe allowlist
 * `ITEM_ROW_WIDTHS` — every entry leaves the fields parseItemRow reads (≤0x9f)
 * in place. An unrecognized width is a typed reject, never a guessed parse at
 * shifted offsets.
 */

import { detectRecordLayout, type DetectedLayout } from './asset-format-error';
import { parseItemRow, type ItemRow } from './item-row';

const XOR_KEY = 0x5a;
const TRAILER_SIZES = [0, 4] as const;
/** Append-safe row widths (SoT for the item-row/extra-item record allowlists). */
export const ITEM_ROW_WIDTHS = [164, 168, 172] as const;
/** OOM guard: reject a derived row count above this. */
const MAX_ITEM_ROWS = 65536;
/** Truncation guard: real tables ship ≥6500 rows. */
const MIN_ITEM_ROWS = 1000;

export interface ItemListRow extends ItemRow {
  /** Item id = position in the ItemList table (0..count-1). */
  id: number;
}

/**
 * Structural plausibility of a candidate `(width, count)` — used ONLY to
 * disambiguate when two allowlisted widths both divide the length. Decrypts the
 * name field of a sample of rows: the correct width yields many rows with a
 * clean printable Latin-1 name, a misaligned width yields near none.
 */
const looksPlausible = (buf: Buffer, layout: DetectedLayout): boolean => {
  const sampleCount = Math.min(layout.count, 256);
  let named = 0;
  for (let id = 0; id < sampleCount; id++) {
    const base = id * layout.width;
    let printable = 0;
    let len = 0;
    for (let i = 0; i < 32; i++) {
      const c = buf[base + i] ^ XOR_KEY;
      if (c === 0) break;
      len++;
      if (c >= 0x20 && c <= 0x7e) printable++;
    }
    if (len >= 2 && printable === len) named++;
  }
  return named >= 8;
};

/** Parse the on-disk ItemList.bin buffer into typed rows (throws AssetFormatError on drift). */
export const parseItemListBin = (buffer: Buffer): ItemListRow[] => {
  const { width, count, payloadSize } = detectRecordLayout(buffer, {
    asset: 'ItemList.bin',
    widths: ITEM_ROW_WIDTHS,
    trailers: TRAILER_SIZES,
    maxCount: MAX_ITEM_ROWS,
    minCount: MIN_ITEM_ROWS,
    plausible: looksPlausible,
  });

  // Copy payload (don't mutate caller's buffer) and decrypt in place.
  const payload = Buffer.from(buffer.subarray(0, payloadSize));
  for (let i = 0; i < payloadSize; i++) {
    payload[i] ^= XOR_KEY;
  }

  const rows: ItemListRow[] = new Array(count);
  for (let id = 0; id < count; id++) {
    const base = id * width;
    rows[id] = { id, ...parseItemRow(payload.subarray(base, base + width)) };
  }
  return rows;
};
