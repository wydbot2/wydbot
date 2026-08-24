import { AssetFormatError } from './asset-format-error';

/** OOM guard: a flat int32 table of icon-cell ids; real files are 6500 entries. */
const MAX_ICON_ENTRIES = 131072;

export interface ItemIconTable {
  /** itemId → 1-based cellIdx; entries with no icon are absent. */
  map: Map<number, number>;
  maxCell: number;
}

/**
 * Parse `resources/itemicon.bin` — a flat `int32[]` of 1-based icon-cell ids
 * keyed by item id. The entry COUNT is derived from the file size (this table
 * grows with the item table); a trailing partial int32 is ignored. Being a flat
 * int32 array with no field offsets, count drift is safe.
 */
export const parseItemIconBin = (buf: Buffer): ItemIconTable => {
  const entries = Math.floor(buf.length / 4);
  if (entries === 0) {
    throw new AssetFormatError('itemicon.bin', 'empty', '≥ 1 int32 entry', `${buf.length} bytes`);
  }
  if (entries > MAX_ICON_ENTRIES) {
    throw new AssetFormatError(
      'itemicon.bin',
      'implausible-count',
      `≤ ${MAX_ICON_ENTRIES} entries`,
      `${entries} entries (${buf.length} bytes)`,
    );
  }

  const map = new Map<number, number>();
  let maxCell = 0;
  for (let id = 0; id < entries; id++) {
    const v = buf.readInt32LE(id * 4);
    if (v > 0) {
      map.set(id, v);
      if (v > maxCell) maxCell = v;
    }
  }
  return { map, maxCell };
};
