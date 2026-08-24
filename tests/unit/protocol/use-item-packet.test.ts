/**
 * Unit tests for `buildUseItemPacket` (0x373 Form A USE).
 *
 * Spec: A wire body" +
 *       mount-system.md §"C2S 0x373 feed body".
 *
 * Verifies byte-exact layout: 36-byte (0x24) frame, header at +0x00..+0x0B,
 * Form A marker at +0x0C, slot at +0x10, feed marker at +0x18, player
 * coords at +0x1C/+0x1E.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildUseItemPacket } from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';

describe('buildUseItemPacket (0x373 Form A USE)', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 36-byte (0x24) frame', () => {
    const buf = buildUseItemPacket(security, 0x1234, 5, 0, { x: 2100, y: 2200 });
    expect(buf.length).toBe(36);
    expect(buf.readUInt16LE(0)).toBe(36); // Size finalized
  });

  it('stamps opcode 0x373 at +0x04 and clientId at +0x06', () => {
    const buf = buildUseItemPacket(security, 0xabcd, 0, 0, { x: 1000, y: 1000 });
    expect(buf.readUInt16LE(0x04)).toBe(0x373);
    expect(buf.readUInt16LE(0x06)).toBe(0xabcd);
  });

  it('writes Form A marker = 1 at +0x0C', () => {
    const buf = buildUseItemPacket(security, 1, 0, 0, { x: 1, y: 1 });
    expect(buf.readUInt32LE(0x0c)).toBe(1);
  });

  it('writes the bag slot at +0x10', () => {
    const buf = buildUseItemPacket(security, 1, 42, 0, { x: 1, y: 1 });
    expect(buf.readUInt32LE(0x10)).toBe(42);
  });

  it('zeroes the padding word at +0x14', () => {
    const buf = buildUseItemPacket(security, 1, 0, 0, { x: 1, y: 1 });
    expect(buf.readUInt32LE(0x14)).toBe(0);
  });

  describe('feedMarker at +0x18 (USE-vs-feed discriminator)', () => {
    it('writes 0 for potion/herb', () => {
      const buf = buildUseItemPacket(security, 1, 0, 0, { x: 1, y: 1 });
      expect(buf.readUInt32LE(0x18)).toBe(0);
    });

    it('writes 0xE for mount feed', () => {
      const buf = buildUseItemPacket(security, 1, 0, 0xe, { x: 1, y: 1 });
      expect(buf.readUInt32LE(0x18)).toBe(0xe);
    });
  });

  describe('player coords at +0x1C/+0x1E (USE-vs-MOVE discriminator)', () => {
    it('stamps non-zero player X/Y to mark this as a USE (not MOVE)', () => {
      const buf = buildUseItemPacket(security, 1, 0, 0, { x: 1234, y: 5678 });
      expect(buf.readUInt16LE(0x1c)).toBe(1234);
      expect(buf.readUInt16LE(0x1e)).toBe(5678);
    });

    it('masks to 16 bits (defensive — tile coords are always int but truncate just in case)', () => {
      const buf = buildUseItemPacket(security, 1, 0, 0, { x: 0x10000 + 7, y: 0x10000 + 9 });
      expect(buf.readUInt16LE(0x1c)).toBe(7);
      expect(buf.readUInt16LE(0x1e)).toBe(9);
    });
  });

  it('zeroes the padding word at +0x20', () => {
    const buf = buildUseItemPacket(security, 1, 0, 0, { x: 1, y: 1 });
    expect(buf.readUInt32LE(0x20)).toBe(0);
  });

  it('byte-exact spec sample — mount feed at slot 7 from (3200, 3300)', () => {
    const buf = buildUseItemPacket(security, 0x1234, 7, 0xe, { x: 3200, y: 3300 });
    // Header
    expect(buf.readUInt16LE(0)).toBe(36); // size
    expect(buf.readUInt16LE(0x04)).toBe(0x373); // opcode
    expect(buf.readUInt16LE(0x06)).toBe(0x1234); // clientId
    // Body
    expect(buf.readUInt32LE(0x0c)).toBe(1); // Form A marker
    expect(buf.readUInt32LE(0x10)).toBe(7); // slot
    expect(buf.readUInt32LE(0x14)).toBe(0); // padding
    expect(buf.readUInt32LE(0x18)).toBe(0xe); // feed marker
    expect(buf.readUInt16LE(0x1c)).toBe(3200); // X
    expect(buf.readUInt16LE(0x1e)).toBe(3300); // Y
    expect(buf.readUInt32LE(0x20)).toBe(0); // trailing padding
  });
});
