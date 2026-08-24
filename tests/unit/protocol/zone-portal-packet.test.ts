/**
 * Unit tests for `buildZonePortalPacket` (0x290).
 *
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildZonePortalPacket } from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import { OPCODE_ZONE_PORTAL } from '../../../src/shared/constants/opcodes';

describe('buildZonePortalPacket (0x290)', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 16-byte (12 header + 4 body) frame', () => {
    const buf = buildZonePortalPacket(security, 0x1234);
    expect(buf.length).toBe(16);
    expect(buf.readUInt16LE(0)).toBe(16);
  });

  it('stamps opcode 0x290 at +0x04 and clientId at +0x06', () => {
    const buf = buildZonePortalPacket(security, 0x02a5);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_ZONE_PORTAL);
    expect(buf.readUInt16LE(0x06)).toBe(0x02a5);
  });

  it('zeros the 4-byte body', () => {
    const buf = buildZonePortalPacket(security, 1);
    expect(buf.readUInt32LE(0x0c)).toBe(0);
  });
});
