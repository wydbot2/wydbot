/**
 * Unit tests for `buildDialogClickPacket` (0x27b).
 *
 * +0x0E zeroed (canonical leaves stack residue).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildDialogClickPacket } from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import { OPCODE_DIALOG_CLICK } from '../../../src/shared/constants/opcodes';

describe('buildDialogClickPacket (0x27b)', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  it('produces a 16-byte (12 header + 4 body) frame', () => {
    const buf = buildDialogClickPacket(security, 0x1234, 1203);
    expect(buf.length).toBe(16);
    expect(buf.readUInt16LE(0)).toBe(16);
  });

  it('stamps opcode 0x27b at +0x04 and clientId at +0x06', () => {
    const buf = buildDialogClickPacket(security, 0xabcd, 1203);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_DIALOG_CLICK);
    expect(buf.readUInt16LE(0x06)).toBe(0xabcd);
  });

  it('writes NPC index at +0x0C and zeros +0x0E', () => {
    const buf = buildDialogClickPacket(security, 1, 1203);
    expect(buf.readUInt16LE(0x0c)).toBe(1203);
    expect(buf.readUInt16LE(0x0e)).toBe(0);
  });
});
