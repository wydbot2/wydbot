/**
 * Byte-offset regression for `parseCreateMobPacket` (0x364 CreateMob).
 *
 * Locks the MScore base at packet+0x8C (NOT 0x8E) — see protocol-reference.md
 * "Mob-class nibble → NPC service routing". The load-bearing guard is
 * `score.merchant === mobClassNibble`: both read packet byte 0x98, so a future
 * off-by-N in the pre-score skip desynchronizes them and fails here.
 */

import { describe, it, expect } from 'vitest';
import { parseCreateMobPacket } from '../../../src/main/protocol/packet-parsers';

const buildCreateMob = (): Buffer => {
  const b = Buffer.alloc(256);
  b.writeUInt16LE(256, 0x00); // size
  b.writeUInt16LE(0x364, 0x04); // opcode
  b.writeUInt16LE(0xabcd, 0x06); // clientId
  b.writeUInt16LE(0x1234, 0x10); // Index
  b.write('Banqueiro\0', 0x12, 'latin1'); // Name[16]
  b.writeUInt16LE(0x3c, 0x22); // Equipment[0] = actionType (Berserker mesh)
  b.writeUInt16LE(0x0bb8, 0x86); // GuildIndex
  b.writeUInt8(0x05, 0x88); // GuildMemberType

  // MScore @ 0x8C (the field under test)
  b.writeInt32LE(100, 0x8c); // level
  b.writeInt32LE(50, 0x90); // defense
  b.writeInt32LE(7, 0x94); // damage
  b.writeUInt8(0x42, 0x98); // merchant byte (low nibble 2 = bank service)
  b.writeUInt8(0x05, 0x99); // speedPacked
  b.writeInt32LE(5000, 0x9c); // maxHp
  b.writeInt32LE(200, 0xa0); // maxMp
  b.writeInt32LE(4000, 0xa4); // currHp
  b.writeInt32LE(150, 0xa8); // currMp
  b.writeInt16LE(10, 0xac); // str
  b.writeInt16LE(20, 0xae); // int
  b.writeInt16LE(30, 0xb0); // dex
  b.writeInt16LE(40, 0xb2); // con

  b.writeUInt16LE(0x8003, 0xbc); // Type/state (high bit set → masked to 3)
  b.write('LAN_A\0', 0xd0, 'latin1'); // Tab[26]
  return b;
};

describe('parseCreateMobPacket — byte-offset layout', () => {
  const p = parseCreateMobPacket(buildCreateMob());

  it('reads Index @0x10 and actionType (Equip[0]) @0x22', () => {
    expect(p.index).toBe(0x1234);
    expect(p.actionType).toBe(0x3c);
  });

  it('reads mobClassNibble from absolute byte 0x98', () => {
    expect(p.mobClassNibble).toBe(0x42);
  });

  it('aligns MScore at 0x8C: score.merchant === mobClassNibble (both byte 0x98)', () => {
    expect(p.score.merchant).toBe(0x42);
    expect(p.score.merchant).toBe(p.mobClassNibble);
  });

  it('reads MScore fields at the corrected base (level@0x8C, defense@0x90, HP@0x9C/0xA4)', () => {
    expect(p.score.level).toBe(100);
    expect(p.score.defense).toBe(50);
    expect(p.score.maxHp).toBe(5000);
    expect(p.score.currHp).toBe(4000);
    expect(p.score.str).toBe(10);
    expect(p.score.con).toBe(40);
  });

  it('reads Type @0xBC masked &0x7FFF (not the old 0xBE)', () => {
    expect(p.type).toBe(3);
  });

  it('keeps Tab aligned at 0xD0 after the skip rebalance', () => {
    expect(p.tab.startsWith('LAN_A')).toBe(true);
  });
});
