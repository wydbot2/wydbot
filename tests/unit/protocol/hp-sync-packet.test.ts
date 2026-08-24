/**
 * Unit tests for the absolute HP/MP sync parsers:
 *  - `parseCompactHpMpSyncPacket` (0x181) — currHp@+0x0C, currMp@+0x10
 *  - `parseDamageEventPacket`     (0x18A) — currHp@+0x0C
 *  - `parseDespawnByObjectIdPacket`(0x16f) — objectId@+0x0C (u16)
 *
 */

import { describe, it, expect } from 'vitest';
import {
  parseCompactHpMpSyncPacket,
  parseDamageEventPacket,
  parseDespawnByObjectIdPacket,
} from '../../../src/main/protocol/packet-parsers';

/** Build a frame with a valid 12-byte header (clientId at +0x06). */
const frame = (size: number, opcode: number, clientId: number): Buffer => {
  const b = Buffer.alloc(size);
  b.writeUInt16LE(size, 0);
  b.writeUInt16LE(opcode, 4);
  b.writeUInt16LE(clientId, 6);
  return b;
};

describe('parseCompactHpMpSyncPacket (0x181)', () => {
  it('reads clientId@+0x06, currHp@+0x0C, currMp@+0x10', () => {
    const buf = frame(20, 0x181, 0x1234);
    buf.writeInt32LE(742, 0x0c);
    buf.writeInt32LE(310, 0x10);
    const p = parseCompactHpMpSyncPacket(buf);
    expect(p.header.clientId).toBe(0x1234);
    expect(p.currHp).toBe(742);
    expect(p.currMp).toBe(310);
  });

  it('reads a zeroed HP/MP frame as 0/0 (dead sync)', () => {
    const buf = frame(20, 0x181, 7);
    const p = parseCompactHpMpSyncPacket(buf);
    expect(p.currHp).toBe(0);
    expect(p.currMp).toBe(0);
  });
});

describe('parseDamageEventPacket (0x18A)', () => {
  it('reads the absolute post-hit currHp@+0x0C and ignores the popup@+0x10', () => {
    const buf = frame(20, 0x18a, 99);
    buf.writeInt32LE(123, 0x0c);
    buf.writeInt32LE(456, 0x10); // damage popup — must NOT surface
    const p = parseDamageEventPacket(buf);
    expect(p.header.clientId).toBe(99);
    expect(p.currHp).toBe(123);
    expect(p).not.toHaveProperty('currMp');
  });
});

describe('parseDespawnByObjectIdPacket (0x16f)', () => {
  it('reads the u16 objectId@+0x0C', () => {
    const buf = frame(16, 0x16f, 5);
    buf.writeUInt16LE(0xbeef, 0x0c);
    const p = parseDespawnByObjectIdPacket(buf);
    expect(p.objectId).toBe(0xbeef);
  });
});
