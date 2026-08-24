/**
 * Spec: Payload Layout
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildSkillCastPacket,
  resolveSkillCastWire,
} from '../../../src/main/protocol/packet-builders';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import {
  OPCODE_SINGLE_ATTACK,
  OPCODE_AOE_ATTACK,
  OPCODE_SKILL_ATTACK,
} from '../../../src/shared/constants/opcodes';

describe('resolveSkillCastWire', () => {
  it('maps packetKind 1 → 0x39D / 72 B / 1 slot', () => {
    expect(resolveSkillCastWire(1)).toEqual({
      opcode: OPCODE_SINGLE_ATTACK,
      totalSize: 0x48,
      maxSlots: 1,
    });
  });

  it('maps packetKind 2 → 0x39E / 80 B / 2 slots', () => {
    expect(resolveSkillCastWire(2)).toEqual({
      opcode: OPCODE_AOE_ATTACK,
      totalSize: 0x50,
      maxSlots: 2,
    });
  });

  it('maps other packetKind → 0x367 / 168 B / min(pk,13) slots', () => {
    expect(resolveSkillCastWire(5)).toEqual({
      opcode: OPCODE_SKILL_ATTACK,
      totalSize: 0xa8,
      maxSlots: 5,
    });
    expect(resolveSkillCastWire(13).maxSlots).toBe(13);
    expect(resolveSkillCastWire(20).maxSlots).toBe(13);
  });
});

describe('buildSkillCastPacket', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  const pos = { x: 2100, y: 2200 };

  it('pk=1: 72-byte frame, opcode 0x39D, single target slot', () => {
    const buf = buildSkillCastPacket(security, 0x10, pos, pos, 0x21, [42], 1);
    expect(buf.length).toBe(0x48);
    expect(buf.readUInt16LE(0)).toBe(0x48);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_SINGLE_ATTACK);
    expect(buf.readUInt16LE(0x06)).toBe(0x10);
    expect(buf.readUInt8(0x2e)).toBe(0xff);
    expect(buf.readInt32LE(0x34)).toBe(-1);
    expect(buf.readUInt16LE(0x38)).toBe(0x21);
    expect(buf.readUInt16LE(0x3c)).toBe(42);
    expect(buf.readInt32LE(0x40)).toBe(-1);
  });

  it('pk=2: 80-byte frame, opcode 0x39E, two target slots', () => {
    const buf = buildSkillCastPacket(security, 7, pos, { x: 1, y: 2 }, 2, [100, 200], 2);
    expect(buf.length).toBe(0x50);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_AOE_ATTACK);
    expect(buf.readUInt16LE(0x3c)).toBe(100);
    expect(buf.readInt32LE(0x40)).toBe(-1);
    expect(buf.readUInt16LE(0x44)).toBe(200);
    expect(buf.readInt32LE(0x48)).toBe(-1);
  });

  it('pk=5: 168-byte frame, opcode 0x367, five slots then zeros', () => {
    const ids = [1, 2, 3, 4, 5];
    const buf = buildSkillCastPacket(security, 1, pos, pos, 0x23, ids, 5);
    expect(buf.length).toBe(0xa8);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_SKILL_ATTACK);
    for (let i = 0; i < 5; i++) {
      expect(buf.readUInt16LE(0x3c + i * 8)).toBe(ids[i]);
      expect(buf.readInt32LE(0x40 + i * 8)).toBe(-1);
    }
    // slot 5 empty
    expect(buf.readUInt16LE(0x3c + 5 * 8)).toBe(0);
    expect(buf.readInt32LE(0x40 + 5 * 8)).toBe(0);
  });

  it('remaps skillType > 0x68 by +0x5F', () => {
    const buf = buildSkillCastPacket(security, 1, pos, pos, 0x69, [1], 1);
    expect(buf.readUInt16LE(0x38)).toBe(0x69 + 0x5f);
  });

  it('stamps attacker and target positions', () => {
    const buf = buildSkillCastPacket(
      security,
      1,
      { x: 100, y: 200 },
      { x: 300, y: 400 },
      1,
      [9],
      1,
    );
    expect(buf.readUInt16LE(0x22)).toBe(100);
    expect(buf.readUInt16LE(0x24)).toBe(200);
    expect(buf.readUInt16LE(0x26)).toBe(300);
    expect(buf.readUInt16LE(0x28)).toBe(400);
  });

  it('pk=2 with one target zeros the second slot', () => {
    const buf = buildSkillCastPacket(security, 1, pos, pos, 2, [42], 2);
    expect(buf.length).toBe(0x50);
    expect(buf.readUInt16LE(0x3c)).toBe(42);
    expect(buf.readInt32LE(0x40)).toBe(-1);
    expect(buf.readUInt16LE(0x44)).toBe(0);
    expect(buf.readInt32LE(0x48)).toBe(0);
  });

  it('truncates extras beyond maxSlots', () => {
    const buf = buildSkillCastPacket(security, 1, pos, pos, 2, [1, 2, 3, 4], 2);
    expect(buf.readUInt16LE(0x3c)).toBe(1);
    expect(buf.readUInt16LE(0x44)).toBe(2);
    // no third slot in 0x50 frame
    expect(buf.length).toBe(0x50);
  });

  it('defaults packetKind to 1 (0x39D single-target)', () => {
    const buf = buildSkillCastPacket(security, 1, pos, pos, 0x21, [9]);
    expect(buf.length).toBe(0x48);
    expect(buf.readUInt16LE(0x04)).toBe(OPCODE_SINGLE_ATTACK);
  });
});
