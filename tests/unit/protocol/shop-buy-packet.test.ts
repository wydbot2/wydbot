/**
 * Unit tests for `buildShopBuyPacket` (0x379).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildShopBuyPacket } from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import { OPCODE_SHOP_BUY } from '../../../src/shared/constants/opcodes';
import { encodeShopWireSlot } from '../../../src/shared/lib/shop-slot';

describe('buildShopBuyPacket (0x379)', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 24-byte frame', () => {
    const buf = buildShopBuyPacket(security, 69, 1203, 6, 4);
    expect(buf.length).toBe(24);
    expect(buf.readUInt16LE(0)).toBe(24);
  });

  it('stamps opcode, clientId, npc, identity-encoded shopSlot, bagSlot', () => {
    // linear 6 < 9 → wire 6
    const buf = buildShopBuyPacket(security, 69, 1203, 6, 4);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_SHOP_BUY);
    expect(buf.readUInt16LE(0x06)).toBe(69);
    expect(buf.readUInt16LE(0x0c)).toBe(1203);
    expect(buf.readUInt16LE(0x0e)).toBe(6);
    expect(buf.readUInt16LE(0x10)).toBe(4);
    expect(buf.readUInt16LE(0x12)).toBe(0);
    expect(buf.readUInt32LE(0x14)).toBe(0);
  });

  it('encodes linear shopSlot >= 9 for wire +0x0E', () => {
    // Aki-style: linear 16 → wire 34
    const buf16 = buildShopBuyPacket(security, 69, 1204, 16, 21);
    expect(buf16.readUInt16LE(0x0e)).toBe(34);
    expect(buf16.readUInt16LE(0x0e)).toBe(encodeShopWireSlot(16));
    expect(buf16.readUInt16LE(0x0c)).toBe(1204);
    expect(buf16.readUInt16LE(0x10)).toBe(21);

    // row boundary: linear 9 → wire 27
    const buf9 = buildShopBuyPacket(security, 1, 100, 9, 0);
    expect(buf9.readUInt16LE(0x0e)).toBe(27);
  });
});
