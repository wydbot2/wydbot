// buildTokenPacket (0xFDE): 4- and 6-digit numeric-password field layout.
import { describe, it, expect, beforeEach } from 'vitest';
import { buildTokenPacket } from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import { OPCODE_TOKEN } from '../../../src/shared/constants/opcodes';
import { TokenPayloadSchema } from '../../../src/shared/ipc/schemas';

describe('TokenPayloadSchema', () => {
  it('requires a numeric password with 4 to 6 digits', () => {
    for (const password of ['1234', '12345', '123456']) {
      expect(TokenPayloadSchema.safeParse({ password, isChanging: 0 }).success).toBe(true);
    }

    for (const password of ['', '123', '1234567', '12ab']) {
      expect(TokenPayloadSchema.safeParse({ password, isChanging: 0 }).success).toBe(false);
    }
  });
});

describe('buildTokenPacket (0xFDE)', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 32-byte frame stamped with the token opcode', () => {
    const buf = buildTokenPacket(security, '1234', 0);
    expect(buf.length).toBe(32);
    expect(buf.readUInt16LE(0)).toBe(32);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_TOKEN);
  });

  it('writes all 6 digits of a 6-digit password at body offset 12, terminator after', () => {
    const buf = buildTokenPacket(security, '123456', 0);
    expect(buf.subarray(12, 18).toString('ascii')).toBe('123456');
    expect(buf[18]).toBe(0); // terminator in the next (Unknown) byte
  });

  it('still works for a 4-digit password (zero-padded — regression)', () => {
    const buf = buildTokenPacket(security, '1234', 0);
    expect(buf.subarray(12, 16).toString('ascii')).toBe('1234');
    expect(buf[16]).toBe(0);
    expect(buf[17]).toBe(0);
  });

  it('carries isChanging at offset 28', () => {
    expect(buildTokenPacket(security, '123456', 1).readInt32LE(28)).toBe(1);
    expect(buildTokenPacket(security, '123456', 0).readInt32LE(28)).toBe(0);
  });
});
