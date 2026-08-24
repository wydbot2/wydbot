// buildRequestMobLoginPacket (0x213): obfuscated, per-login CLIVER version field.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildRequestMobLoginPacket,
  computeClineVersion,
} from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import { OPCODE_REQUEST_MOB_LOGIN } from '../../../src/shared/constants/opcodes';

describe('computeClineVersion (0x213 obfuscated CLIVER)', () => {
  it('reproduces the canonical s=2 sample 0x274DE2', () => {
    expect(computeClineVersion(2)).toBe(2575842); // 0x274DE2
  });

  it('encodes the shift in the low decimal digit (server recovers s = version % 10)', () => {
    for (let s = 1; s <= 9; s++) {
      expect(computeClineVersion(s) % 10).toBe(s);
    }
  });

  it('matches version = s + (0xFB8C << s) * 10 and stays within uint32', () => {
    for (let s = 1; s <= 9; s++) {
      const version = computeClineVersion(s);
      expect(version).toBe(s + (0xfb8c << s) * 10);
      expect(version).toBeGreaterThanOrEqual(0);
      expect(version).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('buildRequestMobLoginPacket (0x213)', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 36-byte frame stamped with the opcode and charIndex', () => {
    const buf = buildRequestMobLoginPacket(security, 3, 0, 2);
    expect(buf.length).toBe(36);
    expect(buf.readUInt16LE(0)).toBe(36);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_REQUEST_MOB_LOGIN);
    expect(buf.readInt32LE(12)).toBe(3);
  });

  it('writes the obfuscated version at offset 20 (shift injected for determinism)', () => {
    const buf = buildRequestMobLoginPacket(security, 0, 0, 2);
    expect(buf.readUInt32LE(20)).toBe(2575842); // 0x274DE2, the s=2 case
  });

  it('varies the version field across default (random) calls but keeps it valid', () => {
    const values = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const version = buildRequestMobLoginPacket(security, 0, 0).readUInt32LE(20);
      const s = version % 10;
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(9);
      expect(version).toBe(computeClineVersion(s));
      values.add(version);
    }
    // 40 rolls over 9 possibilities — a single distinct value is effectively impossible.
    expect(values.size).toBeGreaterThan(1);
  });
});
