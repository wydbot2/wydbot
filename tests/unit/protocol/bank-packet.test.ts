/**
 * Unit tests for the bank wire builders:
 *  - `buildItemMovePacket` (0x376) `bankerId` field at +0x10
 *  - `buildBankGoldPacket`  (0x388 deposit / 0x387 withdraw)
 *
 * Spec: (DST-first 0x376 body)
 *       + packet-builders.ts @0x388/0x387 doc block (16-byte gold frame).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildItemMovePacket,
  buildBankGoldPacket,
} from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import {
  OPCODE_BANK_GOLD_DEPOSIT,
  OPCODE_BANK_GOLD_WITHDRAW,
} from '../../../src/shared/constants/opcodes';

describe('buildItemMovePacket (0x376) — bankerId @+0x10', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 20-byte (12 header + 8 body) frame', () => {
    const buf = buildItemMovePacket(security, 0x1234, 1, 3, 2, 5, 1000);
    expect(buf.length).toBe(20);
    expect(buf.readUInt16LE(0)).toBe(20);
  });

  it('writes the DST-first body (dstKind, dstSlot, srcKind, srcSlot) at +0x0C..+0x0F', () => {
    const buf = buildItemMovePacket(security, 1, /*src*/ 1, 7, /*dst*/ 2, 9, 1000);
    expect(buf.readUInt8(0x0c)).toBe(2); // dstKind
    expect(buf.readUInt8(0x0d)).toBe(9); // dstSlot
    expect(buf.readUInt8(0x0e)).toBe(1); // srcKind
    expect(buf.readUInt8(0x0f)).toBe(7); // srcSlot
  });

  it('writes the bankerId mobIndex as UInt32LE at +0x10', () => {
    const buf = buildItemMovePacket(security, 1, 1, 0, 2, 0, 1234);
    expect(buf.readUInt32LE(0x10)).toBe(1234);
  });

  it('defaults bankerId to 0 for a plain bag drag (no banker arg)', () => {
    const buf = buildItemMovePacket(security, 1, 1, 0, 1, 1);
    expect(buf.readUInt32LE(0x10)).toBe(0);
  });
});

describe('buildBankGoldPacket (0x388 deposit / 0x387 withdraw)', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 16-byte (12 header + 4 body) frame', () => {
    const buf = buildBankGoldPacket(security, 0x1234, OPCODE_BANK_GOLD_DEPOSIT, 5000);
    expect(buf.length).toBe(16);
    expect(buf.readUInt16LE(0)).toBe(16);
  });

  it('stamps the deposit opcode 0x388 at +0x04 and clientId at +0x06', () => {
    const buf = buildBankGoldPacket(security, 0xabcd, OPCODE_BANK_GOLD_DEPOSIT, 1);
    expect(buf.readUInt16LE(0x04)).toBe(0x388);
    expect(buf.readUInt16LE(0x06)).toBe(0xabcd);
  });

  it('stamps the withdraw opcode 0x387 when given that direction', () => {
    const buf = buildBankGoldPacket(security, 1, OPCODE_BANK_GOLD_WITHDRAW, 1);
    expect(buf.readUInt16LE(0x04)).toBe(0x387);
  });

  it('writes the amount as UInt32LE at +0x0C', () => {
    const buf = buildBankGoldPacket(security, 1, OPCODE_BANK_GOLD_DEPOSIT, 0x0badf00d);
    expect(buf.readUInt32LE(0x0c)).toBe(0x0badf00d);
  });

  it('byte-exact sample — withdraw 1,000,000 gold for clientId 0x1234', () => {
    const buf = buildBankGoldPacket(security, 0x1234, OPCODE_BANK_GOLD_WITHDRAW, 1_000_000);
    expect(buf.readUInt16LE(0)).toBe(16); // size
    expect(buf.readUInt16LE(0x04)).toBe(0x387); // opcode
    expect(buf.readUInt16LE(0x06)).toBe(0x1234); // clientId
    expect(buf.readUInt32LE(0x0c)).toBe(1_000_000); // amount
  });
});
