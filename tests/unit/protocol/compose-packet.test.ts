/**
 * Unit tests for `buildComposeSubmitPacket` (0x2e7).
 *
 * Spec: packet-builders.ts @0x2E7 doc block — 120-byte frame (12 header + 108 body):
 * recipe index i32 @+0x0C, 8×MItem (itemId u16 + stack=0 u16 + 8 zero) @+0x10,
 * 8×u8 source bag slots @+0x70 (0xff = unused). Reference capture: recipe 578
 * RaidMerchant, MItem[0]={620, stack=0}, slot[0]=20. MItem.stack is always 0 —
 * the server reads the actual stack from the source slot index.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildComposeSubmitPacket } from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import { OPCODE_COMPOSE_SUBMIT } from '../../../src/shared/constants/opcodes';

describe('buildComposeSubmitPacket (0x2e7)', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 120-byte (12 header + 108 body) frame', () => {
    const buf = buildComposeSubmitPacket(security, 0x1234, 1409, [
      { itemId: 413, qty: 0, slot: 10 },
    ]);
    expect(buf.length).toBe(120);
    expect(buf.readUInt16LE(0)).toBe(120);
  });

  it('stamps opcode 0x2e7 at +0x04, clientId at +0x06 and recipe index i32 at +0x0C', () => {
    const buf = buildComposeSubmitPacket(security, 0xabcd, 1409, []);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_COMPOSE_SUBMIT);
    expect(buf.readUInt16LE(0x06)).toBe(0xabcd);
    expect(buf.readInt32LE(0x0c)).toBe(1409);
  });

  it('writes the first MItem (itemId + stack=0) at +0x10 and its bag slot at +0x70', () => {
    const buf = buildComposeSubmitPacket(security, 1, 1409, [{ itemId: 413, qty: 0, slot: 10 }]);
    expect(buf.readUInt16LE(0x10)).toBe(413); // MItem itemId
    expect(buf.readUInt16LE(0x12)).toBe(0); // MItem stack — always 0 (server reads from slot)
    expect(buf.readUInt8(0x70)).toBe(10); // source bag slot
  });

  it('zero-fills unused MItem slots and sets unused bag slots to 0xff', () => {
    const buf = buildComposeSubmitPacket(security, 1, 1409, [{ itemId: 413, qty: 0, slot: 0 }]);
    expect(buf.readUInt16LE(0x1c)).toBe(0); // second MItem (0x10 + 12) itemId = 0
    expect(buf.readUInt8(0x70)).toBe(0); // first slot = 0
    expect(buf.readUInt8(0x71)).toBe(0xff); // second (unused) slot = 0xff
  });

  it('lays out all 8 MItem slots in order', () => {
    const buf = buildComposeSubmitPacket(security, 1, 1, [
      { itemId: 100, qty: 0, slot: 0 },
      { itemId: 200, qty: 0, slot: 1 },
    ]);
    expect(buf.readUInt16LE(0x10)).toBe(100);
    expect(buf.readUInt16LE(0x1c)).toBe(200); // 0x10 + 12
    expect(buf.readUInt16LE(0x1e)).toBe(0); // stack always 0
    expect(buf.readUInt8(0x70)).toBe(0);
    expect(buf.readUInt8(0x71)).toBe(1);
    expect(buf.readUInt8(0x72)).toBe(0xff);
  });
});
