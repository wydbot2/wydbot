/**
 * Unit tests for the hunt-scroll wire builders:
 *  - `buildUseItemPacket` destIndex at +0x20 (potions stay 0)
 *  - `buildUseItemArmPacket` (0x3AE Mode=1, 16-byte frame)
 *
 * Spec: body" + §"End-to-end flow".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildUseItemPacket,
  buildUseItemArmPacket,
} from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import { OPCODE_USE_ITEM_ARM } from '../../../src/shared/constants/opcodes';

describe('buildUseItemPacket — destIndex at +0x20', () => {
  let security: PacketSecurity;
  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('defaults destIndex to 0 (potion/herb/feed unchanged) and keeps the 36-byte size', () => {
    const buf = buildUseItemPacket(security, 0x1234, 5, 0, { x: 2100, y: 2200 });
    expect(buf.length).toBe(36);
    expect(buf.readUInt32LE(0x20)).toBe(0);
  });

  it('writes a 1-based hunt-scroll menu index at +0x20', () => {
    const buf = buildUseItemPacket(security, 0x1234, 9, 0, { x: 2269, y: 3910 }, 9);
    expect(buf.readUInt32LE(0x20)).toBe(9);
    expect(buf.readUInt32LE(0x10)).toBe(9); // slot, unaffected
    expect(buf.length).toBe(36);
  });

  it('writes index 1 and leaves the coords as the player position', () => {
    const buf = buildUseItemPacket(security, 1, 0, 0, { x: 2367, y: 4024 }, 1);
    expect(buf.readUInt32LE(0x20)).toBe(1);
    expect(buf.readUInt16LE(0x1c)).toBe(2367);
    expect(buf.readUInt16LE(0x1e)).toBe(4024);
  });
});

describe('buildUseItemArmPacket (0x3AE Mode=1)', () => {
  let security: PacketSecurity;
  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 16-byte frame with opcode 0x3AE and Mode=1 at +0x0C', () => {
    const buf = buildUseItemArmPacket(security, 0xabcd);
    expect(buf.length).toBe(16);
    expect(buf.readUInt16LE(0)).toBe(16); // size finalized
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_USE_ITEM_ARM);
    expect(buf.readUInt16LE(0x06)).toBe(0xabcd); // clientId
    expect(buf.readUInt32LE(0x0c)).toBe(1); // Mode=1
  });
});
