import { describe, expect, it } from 'vitest';

import { decodeWyt } from '@main/game-assets/parsers';

const header = (descriptor: number): Buffer => {
  const buf = Buffer.alloc(22 + 3);
  buf.writeUInt32LE(0x30315457, 0); // 'WT10'
  buf[6] = 0x02; // uncompressed RGB
  buf.writeUInt16LE(1, 16);
  buf.writeUInt16LE(1, 18);
  buf[20] = 24;
  buf[21] = descriptor;
  return buf;
};

const makeWyt = (opts: {
  bpp: 24 | 32;
  imageType?: number;
  width?: number;
  height?: number;
  descriptor?: number;
  payload?: Buffer;
  truncate?: number;
}): Buffer => {
  const width = opts.width ?? 1;
  const height = opts.height ?? 1;
  const stride = opts.bpp / 8;
  const payload = opts.payload ?? Buffer.alloc(width * height * stride);
  const buf = Buffer.alloc(22);
  buf.writeUInt32LE(0x30315457, 0);
  buf[6] = opts.imageType ?? 0x02;
  buf.writeUInt16LE(width, 16);
  buf.writeUInt16LE(height, 18);
  buf[20] = opts.bpp;
  buf[21] = opts.descriptor ?? 0;
  const full = Buffer.concat([buf, payload]);
  return opts.truncate == null ? full : full.subarray(0, opts.truncate);
};

describe('decodeWyt descriptor', () => {
  it('0x00 → topDown=false; 0x20 → topDown=true', () => {
    expect(decodeWyt(header(0x00)).topDown).toBe(false);
    expect(decodeWyt(header(0x20)).topDown).toBe(true);
  });
});

describe('decodeWyt BGRA normalization', () => {
  it('24-bpp expands to 4-byte BGRA with alpha=255', () => {
    const atlas = decodeWyt(makeWyt({ bpp: 24, payload: Buffer.from([1, 2, 3]) }));
    expect([...atlas.pixels]).toEqual([1, 2, 3, 255]);
    expect(atlas.pixels.length).toBe(4);
  });

  it('32-bpp passes through with the file alpha (m0724 case)', () => {
    const atlas = decodeWyt(makeWyt({ bpp: 32, payload: Buffer.from([10, 20, 30, 40]) }));
    expect([...atlas.pixels]).toEqual([10, 20, 30, 40]);
  });

  it('32-bpp honors the descriptor bit like 24-bpp', () => {
    expect(decodeWyt(makeWyt({ bpp: 32, descriptor: 0x08 })).topDown).toBe(false);
    expect(decodeWyt(makeWyt({ bpp: 32, descriptor: 0x28 })).topDown).toBe(true);
  });

  it('rejects unsupported bpp', () => {
    expect(() => decodeWyt(makeWyt({ bpp: 24, payload: Buffer.alloc(3) }))).not.toThrow();
    const buf16 = makeWyt({ bpp: 24 });
    buf16[20] = 16;
    expect(() => decodeWyt(buf16)).toThrow(/Unsupported wyt bpp: 16/);
  });

  it('rejects a truncated 32-bpp payload', () => {
    expect(() => decodeWyt(makeWyt({ bpp: 32, payload: Buffer.from([1, 2, 3]) }))).toThrow(
      /wyt truncated/,
    );
  });

  it('rejects 32-bpp RLE explicitly (no such files in the wild)', () => {
    expect(() => decodeWyt(makeWyt({ bpp: 32, imageType: 0x0a }))).toThrow(
      /Unsupported wyt RLE bpp: 32/,
    );
  });

  it('RLE 24-bpp emits expanded BGRA', () => {
    // one RLE packet: run of 2 pixels (9, 8, 7)
    const atlas = decodeWyt(
      makeWyt({ bpp: 24, imageType: 0x0a, width: 2, payload: Buffer.from([0x81, 9, 8, 7]) }),
    );
    expect([...atlas.pixels]).toEqual([9, 8, 7, 255, 9, 8, 7, 255]);
  });
});
