import { describe, it, expect } from 'vitest';
import { fbcIndex, expIndex, computeChallengeValue } from '../../../src/main/protocol/challenge';
import { EXP_TABLE_NORMAL } from '../../../src/main/protocol/challenge-tables';

describe('fbcIndex (0xFBC) — signed (int)~field68 % 40', () => {
  it('matches canonical anchors', () => {
    expect(fbcIndex(0)).toBe(-1); // (int)~0 = -1, -1 % 40 = -1
    expect(fbcIndex(0x27)).toBe(0); // ~39 = -40, -40 % 40 = 0
    expect(fbcIndex(0xffffff80)).toBe(7); // ~ -> 127, 127 % 40 = 7 (top-bit-set field = server-usable)
  });

  it('clamps index 23 -> 22', () => {
    expect(fbcIndex(0xffffffe8)).toBe(22); // ~(-24) = 23 -> clamped to 22
  });
});

describe('expIndex (0x13BD) — int32 multiply-with-wrap, signed % 400', () => {
  it('wraps the 32-bit multiply, unlike a naive product', () => {
    // (100001 * 100000) overflows int32; wrapped = 1410165408, % 400 = 208.
    expect(expIndex(100000, 100000)).toBe(208);
    // A non-wrapping product collapses to index 0 — prove they differ.
    expect((100001 * 100000) % 400).toBe(0);
  });

  it('keeps a signed remainder for negative products', () => {
    expect(expIndex(1, -1)).toBe(-2); // imul(2, -1) = -2, -2 % 400 = -2
  });

  it('agrees for small non-negative products (server-usable range)', () => {
    expect(expIndex(9, 4)).toBe(40); // imul(10, 4) = 40, 40 % 400 = 40
  });
});

describe('computeChallengeValue integration', () => {
  it('returns 0 for a buffer shorter than 0xb4', () => {
    expect(computeChallengeValue(Buffer.alloc(0x10), 0)).toBe(0);
  });

  it('computes 13BD end-to-end with the 32-bit wrap (selector 1)', () => {
    const buf = Buffer.alloc(0xb4);
    buf.writeInt32LE(100000, 0x88);
    buf.writeInt32LE(100000, 0x38);
    // fieldAC@0xac = 0, fieldB0@0xb0 = 0 => selector = (0 + 0xDC + 0) % 3 = 220 % 3 = 1 (13BD)
    const result = computeChallengeValue(buf, 0);
    expect(result).toBe((EXP_TABLE_NORMAL[208] ^ 0xffff) >>> 0);
    // Not the buggy index-0 collapse (which a non-wrapping multiply would produce).
    expect(result).not.toBe((EXP_TABLE_NORMAL[0] ^ 0xffff) >>> 0);
  });
});
