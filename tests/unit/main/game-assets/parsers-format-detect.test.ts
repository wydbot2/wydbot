/**
 * Verifies the item/mount parsers auto-detect record width + count, so they read
 * BOTH the legacy bundled format (item-row 168 / MountData 140 / 500 rows) AND the
 * RaidHut Global CDN format (item-row 164 / MountData 136 / 200 rows) — with
 * identical field values. The Global record is the legacy record minus 4 trailing
 * (unread) bytes; all field offsets are unchanged (max field read = 0x9e).
 */
import { describe, expect, it } from 'vitest';
import { parseItemRow, MIN_ROW_SIZE } from '@main/game-assets/parsers/item-row';
import { parseItemListBin } from '@main/game-assets/parsers/item-list-bin';
import { parseExtraItemBin } from '@main/game-assets/parsers/extra-item-bin';
import { parseMountDataBin } from '@main/game-assets/parsers/mount-data-bin';
import { parseMountDataVBin } from '@main/game-assets/parsers/mount-data-v-bin';

const XOR = 0x5a;
const xorEncrypt = (b: Buffer): Buffer => {
  const o = Buffer.from(b);
  for (let i = 0; i < o.length; i++) o[i] ^= XOR;
  return o;
};

/** Build a plaintext item-row of `width` bytes with known field values. */
const makeItemRow = (width: number): Buffer => {
  const row = Buffer.alloc(width);
  row.write('TestItem\0', 0, 'latin1');
  row.writeUInt16LE(0x1234, 0x40); // equipModelId
  row.writeUInt16LE(50, 0x46); // level
  row.writeUInt8(7, 0x4a); // skillbar
  row.writeInt16LE(10, 0x50); // effectSlots[0].idx
  row.writeInt16LE(20, 0x52); // effectSlots[0].value
  row.writeUInt16LE(44, 0x84); // mesh
  row.writeUInt16LE(0x40, 0x88); // pos
  row.writeUInt8(3, 0x8e); // grade
  row.writeUInt16LE(0x16, 0x98); // itemClass
  row.writeUInt16LE(99, 0x9a); // mountIndex
  row.writeInt16LE(100, 0x9e); // maxStack
  return row;
};

const expectItemRowFields = (r: ReturnType<typeof parseItemRow>) => {
  expect(r.name).toBe('TestItem');
  expect(r.equipModelId).toBe(0x1234);
  expect(r.level).toBe(50);
  expect(r.skillbar).toBe(7);
  expect(r.effectSlots[0]).toEqual({ idx: 10, value: 20 });
  expect(r.mesh).toBe(44);
  expect(r.pos).toBe(0x40);
  expect(r.grade).toBe(3);
  expect(r.itemClass).toBe(0x16);
  expect(r.mountIndex).toBe(99);
  expect(r.maxStack).toBe(100);
};

describe('parseItemRow width tolerance', () => {
  it('parses identical fields from 164- and 168-byte rows', () => {
    expectItemRowFields(parseItemRow(makeItemRow(168)));
    expectItemRowFields(parseItemRow(makeItemRow(164)));
  });
  it('rejects rows shorter than the last field', () => {
    expect(() => parseItemRow(makeItemRow(MIN_ROW_SIZE - 1))).toThrow();
  });
});

describe('parseItemListBin auto-detects row width', () => {
  const buildFile = (width: number): Buffer => {
    const payload = Buffer.alloc(6500 * width);
    makeItemRow(width).copy(payload, 1 * width); // row id=1
    return Buffer.concat([xorEncrypt(payload), Buffer.alloc(4)]); // + 4-byte trailer
  };
  for (const width of [168, 164]) {
    it(`reads ${width}-byte rows (6500 rows + trailer)`, () => {
      const rows = parseItemListBin(buildFile(width));
      expect(rows).toHaveLength(6500);
      expect(rows[1].id).toBe(1);
      expectItemRowFields(rows[1]);
    });
  }
  it('throws on a size matching no known width', () => {
    expect(() => parseItemListBin(Buffer.alloc(123))).toThrow();
  });
});

describe('parseExtraItemBin auto-detects record size', () => {
  const buildFile = (recordSize: number, count: number): Buffer => {
    const rowWidth = recordSize - 2;
    const buf = Buffer.alloc(recordSize * count);
    for (let i = 0; i < count; i++) {
      const off = i * recordSize;
      buf.writeInt16LE(i + 1, off); // id (1-based, valid)
      makeItemRow(rowWidth).copy(buf, off + 2);
    }
    return buf;
  };
  for (const recordSize of [170, 166]) {
    it(`reads ${recordSize}-byte records`, () => {
      const { records } = parseExtraItemBin(buildFile(recordSize, 5));
      expect(records).toHaveLength(5);
      expect(records[0].id).toBe(1);
      expectItemRowFields(records[0].rowParsed);
    });
  }
});

describe('parseMountDataBin auto-detects stride + count', () => {
  const buildFile = (stride: number, count: number): Buffer => {
    const payload = Buffer.alloc(stride * count);
    payload.writeUInt32LE(7000, 0x1c); // baseHp on row 0
    payload.writeUInt32LE(123, 0x20); // damage
    payload.writeUInt32LE(456, 0x30); // mountSancOverride
    return Buffer.concat([xorEncrypt(payload), Buffer.alloc(4)]); // + trailer
  };
  it('reads 140-byte × 500 (legacy)', () => {
    const rows = parseMountDataBin(buildFile(140, 500));
    expect(rows).toHaveLength(500);
    expect(rows[0].baseHp).toBe(7000);
    expect(rows[0].damage).toBe(123);
    expect(rows[0].mountSancOverride).toBe(456);
    expect(rows[0].grid3CTo8A).toHaveLength(0x8c - 0x3c); // 80
  });
  it('reads 136-byte × 200 (Global), grid clamped to row end', () => {
    const rows = parseMountDataBin(buildFile(136, 200));
    expect(rows).toHaveLength(200);
    expect(rows[0].baseHp).toBe(7000);
    expect(rows[0].damage).toBe(123);
    expect(rows[0].mountSancOverride).toBe(456);
    expect(rows[0].grid3CTo8A).toHaveLength(136 - 0x3c); // 76
  });
});

describe('parseMountDataVBin derives count', () => {
  const buildFile = (count: number): Buffer => {
    const payload = Buffer.alloc(0x1c * count);
    payload.writeInt16LE(31, 0x00); // mountClass on row 0
    payload.writeFloatLE(1.0, 0x14); // scaleRatio
    payload.writeInt16LE(5, 0x18); // refineBonusIndex
    return Buffer.concat([xorEncrypt(payload), Buffer.alloc(4)]); // + trailer
  };
  for (const count of [500, 200]) {
    it(`reads ${count} rows`, () => {
      const rows = parseMountDataVBin(buildFile(count));
      expect(rows).toHaveLength(count);
      expect(rows[0].mountClass).toBe(31);
      expect(rows[0].scaleRatio).toBeCloseTo(1.0);
      expect(rows[0].refineBonusIndex).toBe(5);
    });
  }
});
