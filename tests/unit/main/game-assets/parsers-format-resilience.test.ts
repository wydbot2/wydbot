/**
 * Resilience contract for the binary asset parsers: a game patch can change a
 * record width or row count at any time, and the parsers must (a) transparently
 * absorb an APPEND-only growth (patch 717 grew ItemList 168→172 / 6500→14500 and
 * extraitem record 170→174), and (b) FAIL VISIBLY with a typed AssetFormatError
 * on any unrecognized / truncated / oversized / ambiguous layout — never crash,
 * never read at a guessed stride.
 */
import { describe, expect, it } from 'vitest';
import { AssetFormatError, detectRecordLayout } from '@main/game-assets/parsers/asset-format-error';
import { parseItemListBin } from '@main/game-assets/parsers/item-list-bin';
import { parseExtraItemBin } from '@main/game-assets/parsers/extra-item-bin';
import { parseItemIconBin } from '@main/game-assets/parsers/itemicon-bin';
import { parseItemRow } from '@main/game-assets/parsers/item-row';

const XOR = 0x5a;
const xor = (b: Buffer): Buffer => {
  const o = Buffer.from(b);
  for (let i = 0; i < o.length; i++) o[i] ^= XOR;
  return o;
};

/** Plaintext item row with a printable name (so the plausibility check accepts it). */
const makeItemRow = (width: number, name: string): Buffer => {
  const row = Buffer.alloc(width);
  row.write(`${name}\0`, 0, 'latin1');
  row.writeUInt16LE(0x1234, 0x40);
  row.writeUInt16LE(50, 0x46);
  row.writeUInt8(7, 0x4a);
  row.writeInt16LE(10, 0x50);
  row.writeInt16LE(20, 0x52);
  row.writeUInt16LE(44, 0x84);
  row.writeUInt16LE(0x40, 0x88);
  row.writeUInt8(3, 0x8e);
  row.writeUInt16LE(0x16, 0x98);
  row.writeUInt16LE(99, 0x9a);
  row.writeInt16LE(100, 0x9e);
  return row;
};

/** Build an ItemList.bin of `count` rows × `width`, first 16 rows named, + trailer. */
const buildItemList = (width: number, count: number): Buffer => {
  const payload = Buffer.alloc(count * width);
  for (let id = 0; id < Math.min(count, 16); id++) {
    makeItemRow(width, `Item${id}`).copy(payload, id * width);
  }
  return Buffer.concat([xor(payload), Buffer.alloc(4)]);
};

describe('parseItemListBin — append-only growth (patch 717)', () => {
  it('reads the 172-byte / 14500-row layout with fields byte-correct', () => {
    const rows = parseItemListBin(buildItemList(172, 14500));
    expect(rows).toHaveLength(14500);
    expect(rows[1].id).toBe(1);
    expect(rows[1].name).toBe('Item1');
    expect(rows[1].itemClass).toBe(0x16);
    expect(rows[1].maxStack).toBe(100);
  });

  it('parses a 172-row identically to the same row at width 168 (offsets preserved)', () => {
    // rawRow differs by the 4 appended bytes; every decoded FIELD must match.
    const { rawRow: _a, nameRaw: _b, ...f168 } = parseItemRow(makeItemRow(168, 'Sword'));
    const { rawRow: _c, nameRaw: _d, ...f172 } = parseItemRow(makeItemRow(172, 'Sword'));
    expect(f172).toEqual(f168);
  });
});

describe('parseItemListBin — fails visibly on drift', () => {
  it('rejects an unrecognized width that still divides cleanly', () => {
    // 176 is a clean divisor but NOT on the append-safe allowlist.
    expect(() => parseItemListBin(buildItemList(176, 6500))).toThrow(AssetFormatError);
  });
  it('rejects a truncated file (too few rows)', () => {
    expect(() => parseItemListBin(buildItemList(168, 100))).toThrow(/truncated/);
  });
  it('rejects an empty buffer', () => {
    expect(() => parseItemListBin(Buffer.alloc(0))).toThrow(AssetFormatError);
  });
  it('rejects a size matching no known width', () => {
    expect(() => parseItemListBin(Buffer.alloc(12345))).toThrow(/unknown-layout/);
  });
  it('rejects an ambiguous length (divides by two widths, content undecidable)', () => {
    // 172200 bytes ÷164 = 1050 rows AND ÷168 = 1025 rows; all-zero payload can't
    // disambiguate → ambiguous-stride rather than a silent wrong-stride read.
    const buf = Buffer.alloc(172200);
    expect(() => parseItemListBin(buf)).toThrow(/ambiguous-stride|truncated|unknown/);
  });
});

describe('parseExtraItemBin — record 174 (patch 717) + drift', () => {
  const build = (recordSize: number, count: number): Buffer => {
    const buf = Buffer.alloc(recordSize * count);
    for (let i = 0; i < count; i++) {
      const off = i * recordSize;
      buf.writeInt16LE(i + 1, off);
      makeItemRow(recordSize - 2, `X${i}`).copy(buf, off + 2);
    }
    return buf;
  };
  it('reads 174-byte records (2 + 172-byte row)', () => {
    const { records } = parseExtraItemBin(build(174, 2009));
    expect(records).toHaveLength(2009);
    expect(records[0].id).toBe(1);
    expect(records[0].rowParsed.itemClass).toBe(0x16);
  });
  it('rejects an unknown record size', () => {
    expect(() => parseExtraItemBin(Buffer.alloc(999))).toThrow(AssetFormatError);
  });
});

describe('parseItemIconBin — derives count, guards OOM', () => {
  it('reads a grown table (14500 int32 entries)', () => {
    const buf = Buffer.alloc(14500 * 4);
    buf.writeInt32LE(5, 6 * 4); // item 6 → cell 5
    const { map } = parseItemIconBin(buf);
    expect(map.get(6)).toBe(5);
  });
  it('rejects an implausibly large table (OOM guard)', () => {
    // 131072 entries is the ceiling; one past it must reject, not allocate.
    const buf = Buffer.alloc((131072 + 1) * 4);
    expect(() => parseItemIconBin(buf)).toThrow(/implausible-count/);
  });
  it('rejects an empty buffer', () => {
    expect(() => parseItemIconBin(Buffer.alloc(0))).toThrow(/empty/);
  });
});

describe('detectRecordLayout — core rules', () => {
  const opts = { asset: 'X', widths: [10] as const, maxCount: 100, minCount: 2 };
  it('derives count from size', () => {
    expect(detectRecordLayout(Buffer.alloc(50), opts)).toMatchObject({ width: 10, count: 5 });
  });
  it('honors a 4-byte trailer', () => {
    const r = detectRecordLayout(Buffer.alloc(54), { ...opts, trailers: [0, 4] });
    // 54 bytes → 5 records × 10 + 4 trailer consumed (payload excludes the trailer).
    expect(r).toMatchObject({ width: 10, count: 5, payloadSize: 50 });
  });
  it('rejects count over the ceiling as implausible-count', () => {
    expect(() => detectRecordLayout(Buffer.alloc(2000), opts)).toThrow(/implausible-count/);
  });
  it('rejects count under the floor as truncated', () => {
    expect(() => detectRecordLayout(Buffer.alloc(10), opts)).toThrow(/truncated/);
  });
});
