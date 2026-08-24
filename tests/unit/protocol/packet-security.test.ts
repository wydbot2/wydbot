/**
 * Unit tests for WYD2 packet encryption/decryption.
 * Tests verified against the C# PacketSecurity.cs implementation.
 */

import { PacketSecurity } from '../../../src/main/protocol/packet-security';

/**
 * Helper: create a minimal valid packet buffer.
 * Packet header layout (12 bytes):
 *   [0-1]  Size     (uint16 LE)
 *   [2]    Key      (uint8)
 *   [3]    CheckSum (uint8) - set by encrypt, validated by decrypt
 *   [4-5]  Opcode   (uint16 LE)
 *   [6-7]  ClientId (uint16 LE)
 *   [8-11] TimeStamp(int32 LE)
 */
const makePacket = (payload: number[]): Buffer => {
  const size = 12 + payload.length;
  const buf = Buffer.alloc(size);
  buf.writeUInt16LE(size, 0); // Size
  buf.writeUInt8(0, 2); // Key = 0
  buf.writeUInt8(0, 3); // CheckSum placeholder
  buf.writeUInt16LE(0x20d, 4); // Opcode (AccountLogin)
  buf.writeUInt16LE(0, 6); // ClientId
  buf.writeInt32LE(12345, 8); // TimeStamp
  for (let i = 0; i < payload.length; i++) {
    buf[12 + i] = payload[i];
  }
  return buf;
};

describe('PacketSecurity', () => {
  let security: PacketSecurity;

  beforeEach(() => {
    security = new PacketSecurity();
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and then decrypt back to original payload', () => {
      const payload = [0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48];
      const buf = makePacket(payload);

      // Save original bytes from offset 4 onward (the part that gets encrypted)
      const originalPayload = Buffer.from(buf.subarray(4));

      security.encrypt(buf);

      // Decrypt should return true (valid checksum)
      const valid = security.decrypt(buf);
      expect(valid).toBe(true);

      // Bytes from offset 4 onward should match original
      expect(buf.subarray(4)).toEqual(originalPayload);
    });

    it('should round-trip with various key values', () => {
      for (let key = 0; key < 10; key++) {
        const payload = Array.from({ length: 20 }, (_, i) => (i * 7 + key) & 0xff);
        const buf = makePacket(payload);
        buf[2] = key; // Set different Key values

        const original = Buffer.from(buf.subarray(4));
        security.encrypt(buf);
        const valid = security.decrypt(buf);
        expect(valid).toBe(true);
        expect(buf.subarray(4)).toEqual(original);
      }
    });
  });

  describe('encrypted buffer differs from original', () => {
    it('should produce different bytes after encryption', () => {
      const payload = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
      const buf = makePacket(payload);
      const beforeEncrypt = Buffer.from(buf);

      security.encrypt(buf);

      // At least some bytes from offset 4 onward should differ
      let diffCount = 0;
      for (let i = 4; i < buf.length; i++) {
        if (buf[i] !== beforeEncrypt[i]) diffCount++;
      }
      expect(diffCount).toBeGreaterThan(0);
    });
  });

  describe('checksum validation', () => {
    it('should fail decryption when checksum byte is corrupted', () => {
      const payload = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x01, 0x02];
      const buf = makePacket(payload);

      security.encrypt(buf);

      // Corrupt the checksum byte
      buf[3] = (buf[3] + 1) & 0xff;

      const valid = security.decrypt(buf);
      expect(valid).toBe(false);
    });

    it('should fail decryption when key byte is corrupted', () => {
      const payload = [0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80];
      const buf = makePacket(payload);

      // Pinned key byte: a random one keeps the 1-byte checksum valid ~5% of the time.
      security.encrypt(buf, () => 0x5a);

      // Corrupt the key byte (offset 2) — changes which KEY_TABLE entries
      // are used for decryption, causing a checksum mismatch
      buf[2] = (buf[2] + 1) & 0xff;

      const valid = security.decrypt(buf);
      expect(valid).toBe(false);
    });
  });

  describe('small packet (header-only, 12 bytes)', () => {
    it('should encrypt and decrypt a minimal 12-byte packet', () => {
      const buf = makePacket([]);
      const original = Buffer.from(buf.subarray(4));

      security.encrypt(buf);
      const valid = security.decrypt(buf);

      expect(valid).toBe(true);
      expect(buf.subarray(4)).toEqual(original);
    });
  });

  describe('buffer smaller than 12 bytes is not encrypted', () => {
    it('should not modify a buffer shorter than 12 bytes', () => {
      const buf = Buffer.alloc(8);
      buf.writeUInt16LE(8, 0);
      const copy = Buffer.from(buf);

      security.encrypt(buf);

      expect(buf).toEqual(copy);
    });
  });

  describe('large payload round-trip', () => {
    it('should handle a packet with 500 payload bytes', () => {
      const payload = Array.from({ length: 500 }, (_, i) => i & 0xff);
      const buf = makePacket(payload);
      const original = Buffer.from(buf.subarray(4));

      security.encrypt(buf);
      const valid = security.decrypt(buf);

      expect(valid).toBe(true);
      expect(buf.subarray(4)).toEqual(original);
    });
  });

  describe('getHashByte', () => {
    it('should return 0 when no hash table is set', () => {
      const byte = security.getHashByte();
      expect(byte).toBe(0);
    });

    it('should return XOR-inverted hash table values when table is set', () => {
      const table = new Uint8Array([
        0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0,
        0x01,
      ]);
      security.setHashTable(table);

      // First 16 calls should return table[i] ^ 0xFF
      const firstByte = security.getHashByte();
      expect(firstByte).toBe(0x10 ^ 0xff);
    });

    it('should throw if hash table is not 16 bytes', () => {
      expect(() => security.setHashTable(new Uint8Array(10))).toThrow();
      expect(() => security.setHashTable(new Uint8Array(0))).toThrow();
      expect(() => security.setHashTable(new Uint8Array(20))).toThrow();
    });
  });

  describe('reset', () => {
    it('should reset all state for reconnection', () => {
      const table = new Uint8Array([
        0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0,
        0x01,
      ]);
      security.setHashTable(table);
      security.getHashByte(); // consume one increment

      security.reset();

      // After reset, getHashByte should return 0 (no hash table)
      expect(security.getHashByte()).toBe(0);
    });
  });

  describe('encrypt zero-key substitution (game)', () => {
    it('replaces a zero key byte with the injected random byte', () => {
      const buf = makePacket([1, 2, 3, 4]); // makePacket sets key@2 = 0
      security.encrypt(buf, () => 0x5a);
      expect(buf[2]).toBe(0x5a);
    });

    it('leaves a non-zero key byte untouched (no substitution)', () => {
      const buf = makePacket([1, 2, 3, 4]);
      buf[2] = 0x33;
      security.encrypt(buf, () => 0x5a); // injected RNG must not be consumed
      expect(buf[2]).toBe(0x33);
    });

    it('round-trips after substitution (decrypt keys off the substituted byte)', () => {
      const payload = [0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48];
      const buf = makePacket(payload);
      const original = Buffer.from(buf.subarray(4));

      security.encrypt(buf, () => 0x5a);
      expect(buf[2]).toBe(0x5a);
      expect(security.decrypt(buf)).toBe(true);
      expect(buf.subarray(4)).toEqual(original);
    });

    it('varies the substituted key across calls with the default RNG', () => {
      const keys = new Set<number>();
      for (let i = 0; i < 60; i++) {
        const buf = makePacket([1, 2, 3, 4]);
        security.encrypt(buf);
        keys.add(buf[2]);
      }
      expect(keys.size).toBeGreaterThan(1); // varies across calls, not a frozen 0
    });
  });

  describe('Phase-1 hash counter is transactional (peek at build, advance at send)', () => {
    const TABLE = new Uint8Array([
      0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0,
      0x01,
    ]);

    it('getHashByte is a pure peek — repeated calls do not advance the counter', () => {
      security.setHashTable(TABLE);
      expect(security.getHashByte()).toBe(0x10 ^ 0xff);
      expect(security.getHashByte()).toBe(0x10 ^ 0xff); // same index — peek has no side effect
    });

    it('advanceHashByte moves to the next table entry', () => {
      security.setHashTable(TABLE);
      expect(security.getHashByte()).toBe(0x10 ^ 0xff); // index 0
      security.advanceHashByte();
      expect(security.getHashByte()).toBe(0x20 ^ 0xff); // index 1
      security.advanceHashByte();
      expect(security.getHashByte()).toBe(0x30 ^ 0xff); // index 2
    });

    it('a dropped packet reuses the same index', () => {
      security.setHashTable(TABLE);
      expect(security.getHashByte()).toBe(0x10 ^ 0xff); // packet A peeks index 0, then is DROPPED
      expect(security.getHashByte()).toBe(0x10 ^ 0xff); // packet B reuses index 0
      security.advanceHashByte(); // B is actually sent
      expect(security.getHashByte()).toBe(0x20 ^ 0xff); // next packet: index 1
    });

    it('advanceHashByte is a no-op before login (no hash table)', () => {
      security.advanceHashByte();
      security.advanceHashByte();
      expect(security.getHashByte()).toBe(0); // still Phase 0
    });

    it('advanceHashByte stops after 16 packets (leaves Phase 1, stays deterministic)', () => {
      security.setHashTable(TABLE);
      for (let i = 0; i < 16; i++) security.advanceHashByte();
      const phase2 = security.getHashByte(); // Phase 2 static fallback
      security.advanceHashByte();
      security.advanceHashByte();
      expect(security.getHashByte()).toBe(phase2); // extra advances do nothing
    });
  });
});
