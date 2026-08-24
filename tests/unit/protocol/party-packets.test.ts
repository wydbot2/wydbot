/** */
import { describe, it, expect } from 'vitest';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';
import {
  buildPartyInvitePacket,
  buildPartyAcceptPacket,
  buildPartyLeavePacket,
} from '../../../src/main/protocol/packet-builders';
import {
  parsePartyInviteNotifyPacket,
  parsePartyRosterMemberPacket,
  parsePartyRosterFinalizePacket,
  parsePartyLeavePacket,
} from '../../../src/main/protocol/packet-parsers';
import {
  OPCODE_PARTY_INVITE,
  OPCODE_PARTY_ACCEPT,
  OPCODE_PARTY_LEAVE,
} from '../../../src/shared/constants/opcodes';

const hexBody = (s: string): Buffer => {
  // 12-byte header (opcode @+4 is irrelevant to the body parsers) + body.
  const body = Buffer.from(s.replace(/\s+/g, ''), 'hex');
  return Buffer.concat([Buffer.alloc(12), body]);
};

describe('party builders', () => {
  it('buildPartyInvitePacket — 44 B, self@+8, target@+0x1c, name@+0xa', () => {
    const buf = buildPartyInvitePacket(new PacketSecurity(), 254, 262, 'eguaManeira', {
      x: 100,
      y: 200,
    });
    expect(buf.length).toBe(44);
    expect(buf.readUInt16LE(0)).toBe(44); // size
    expect(buf.readUInt16LE(4)).toBe(OPCODE_PARTY_INVITE);
    expect(buf.readUInt16LE(6)).toBe(254); // clientId = self charIndex
    expect(buf.readUInt16LE(12 + 0x08)).toBe(254); // self charIndex @body+8
    expect(buf.readUInt16LE(12 + 0x04)).toBe(100); // posX
    expect(buf.readUInt16LE(12 + 0x06)).toBe(200); // posY
    expect(buf.readUInt16LE(12 + 0x1c)).toBe(262); // target charIndex @body+0x1c
    expect(buf.subarray(12 + 0x0a, 12 + 0x0a + 11).toString('ascii')).toBe('eguaManeira');
  });

  it('buildPartyAcceptPacket — 32 B, inviter@+0, name@+2', () => {
    const buf = buildPartyAcceptPacket(new PacketSecurity(), 262, 254, 'eguaManeira');
    expect(buf.length).toBe(32);
    expect(buf.readUInt16LE(0)).toBe(32);
    expect(buf.readUInt16LE(4)).toBe(OPCODE_PARTY_ACCEPT);
    expect(buf.readUInt16LE(6)).toBe(262); // clientId = own charIndex
    expect(buf.readUInt16LE(12 + 0x00)).toBe(254); // inviter charIndex @body+0
    expect(buf.subarray(12 + 0x02, 12 + 0x02 + 11).toString('ascii')).toBe('eguaManeira');
  });

  it('invite builder survives an encrypt→decrypt round-trip (checksum OK)', () => {
    const sec = new PacketSecurity();
    const buf = buildPartyInvitePacket(sec, 254, 262, 'eguaManeira', { x: 1, y: 2 });
    sec.encrypt(buf);
    expect(sec.decrypt(buf)).toBe(true); // checksum validates
    expect(buf.readUInt16LE(4)).toBe(OPCODE_PARTY_INVITE);
    expect(buf.readUInt16LE(12 + 0x1c)).toBe(262);
  });

  it('buildPartyLeavePacket — 16 B, opcode 0x37e, zero body', () => {
    const buf = buildPartyLeavePacket(new PacketSecurity(), 795);
    expect(buf.length).toBe(16);
    expect(buf.readUInt16LE(0)).toBe(16);
    expect(buf.readUInt16LE(4)).toBe(OPCODE_PARTY_LEAVE);
    expect(buf.readUInt16LE(6)).toBe(795); // clientId = self charIndex
    expect(buf.subarray(12).equals(Buffer.alloc(4))).toBe(true); // zero body
  });
});

describe('party parsers (decrypted capture fixtures)', () => {
  it('parsePartyInviteNotifyPacket — inviter idx 254 + name', () => {
    const pkt = hexBody(
      '01 00 8d 01 fd 46 fd 46 fe 00 65 67 75 61 4d 61 6e 65 69 72 61 00 fe fe fe fe cc cc fe 00 00 00',
    );
    const r = parsePartyInviteNotifyPacket(pkt);
    expect(r.inviterIndex).toBe(254);
    expect(r.inviterName).toBe('eguaManeira');
  });

  it('parsePartyRosterMemberPacket — leader (eguaManeira, 254)', () => {
    const pkt = hexBody(
      '01 00 8d 01 fd 46 fd 46 fe 00 65 67 75 61 4d 61 6e 65 69 72 61 00 fe fe fe fe cc cc',
    );
    const r = parsePartyRosterMemberPacket(pkt);
    expect(r.charIndex).toBe(254);
    expect(r.name).toBe('eguaManeira');
    expect(r.isLeader).toBe(true);
  });

  it('parsePartyRosterMemberPacket — member (Re-No-Quibe, 262)', () => {
    const pkt = hexBody(
      '03 01 ef 00 b8 0f b8 0f 06 01 52 65 2d 4e 6f 2d 51 75 69 62 65 00 fe fe fe fe cc cc',
    );
    const r = parsePartyRosterMemberPacket(pkt);
    expect(r.charIndex).toBe(262);
    expect(r.name).toBe('Re-No-Quibe');
    expect(r.isLeader).toBe(false);
  });

  it('parsePartyRosterFinalizePacket — charIndex 262', () => {
    const pkt = hexBody('06 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 cc cc');
    expect(parsePartyRosterFinalizePacket(pkt).charIndex).toBe(262);
  });

  it('parsePartyLeavePacket — leaver charIndex 795 / dissolve 0', () => {
    expect(parsePartyLeavePacket(hexBody('1b 03 00 00')).charIndex).toBe(795);
    expect(parsePartyLeavePacket(hexBody('00 00 00 00')).charIndex).toBe(0);
  });
});
