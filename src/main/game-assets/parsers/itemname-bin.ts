/**
 * Parser for `resources/itemname.bin`.
 *
 *   - No header. Stream of 68-byte fixed records, EOF-terminated.
 *   - Record: int32 id (LE) + char[0x40] name.
 *   - Records with id < 0 are sentinels (skipped). id >= 6500 also skipped.
 *   - Obfuscation: encoder did `name[i] += (char)i` for i ∈ [0, 0x3E).
 *     Decoder: `name[i] -= i`. Last 2 bytes (i=62, 63) are untouched padding.
 *   - Encoding: 8-bit codepage (Latin-1 confirmed for PT-BR builds).
 */

const RECORD_SIZE = 68;
const NAME_OFFSET = 4;
const NAME_LEN = 0x40; // 64
const DEOBFUSCATE_LEN = 0x3e; // 62
const ID_MAX = 0x1964; // 6500

export interface ItemnameParseStats {
  total: number;
  valid: number;
  skippedSentinel: number;
  skippedOutOfRange: number;
  /** Ids whose decoded name contains at least one byte >= 0x80. */
  nonAsciiIds: number[];
}

/**
 * Parse `itemname.bin` into a `Map<id, name>`.
 *
 * @param buffer  raw file contents
 * @param stats   optional out-param populated with parse diagnostics
 */
export const parseItemnameBin = (
  buffer: Buffer,
  stats?: ItemnameParseStats,
): Map<number, string> => {
  const out = new Map<number, string>();
  const recordCount = Math.floor(buffer.length / RECORD_SIZE);

  if (stats) {
    stats.total = recordCount;
    stats.valid = 0;
    stats.skippedSentinel = 0;
    stats.skippedOutOfRange = 0;
    stats.nonAsciiIds = [];
  }

  for (let r = 0; r < recordCount; r++) {
    const base = r * RECORD_SIZE;
    const id = buffer.readInt32LE(base);

    if (id < 0) {
      if (stats) stats.skippedSentinel++;
      continue;
    }
    if (id >= ID_MAX) {
      if (stats) stats.skippedOutOfRange++;
      continue;
    }

    // Decode in-place into a fresh slice so the original buffer stays clean.
    const nameBytes = Buffer.from(
      buffer.subarray(base + NAME_OFFSET, base + NAME_OFFSET + NAME_LEN),
    );
    for (let i = 0; i < DEOBFUSCATE_LEN; i++) {
      nameBytes[i] = (nameBytes[i] - i) & 0xff;
    }

    let end = nameBytes.indexOf(0);
    if (end === -1) end = NAME_LEN;
    const nameSlice = nameBytes.subarray(0, end);

    if (stats) {
      for (const b of nameSlice) {
        if (b >= 0x80) {
          stats.nonAsciiIds.push(id);
          break;
        }
      }
      stats.valid++;
    }

    out.set(id, nameSlice.toString('latin1'));
  }

  return out;
};
