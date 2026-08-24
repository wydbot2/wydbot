/**
 * Unit tests for PacketReader/PacketWriter binary serialization.
 * Verifies struct read/write round-trip for key game structures.
 */

import { PacketReader, PacketWriter } from '../../../src/main/protocol/packet-codec';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';

/** Header size in bytes: Size(2) + Key(1) + CheckSum(1) + Opcode(2) + ClientId(2) + TimeStamp(4) = 12 */
const HEADER_SIZE = 12;

/** Writer security context — only the writer's hash byte is read, never advanced in these tests. */
const security = new PacketSecurity();

/** Known test values for MScore assertions */
const TEST_SCORE = {
  level: 150,
  defense: 500,
  damage: 300,
  merchant: 1,
  movementSpeed: 4,
  direction: 3,
  chaosRate: 10,
  maxHp: 10000,
  maxMp: 5000,
  currHp: 8500,
  currMp: 3200,
  str: 200,
  int: 100,
  dex: 80,
  con: 90,
  special: [10, 20, 30, 40] as const,
} as const;

describe('PacketReader / PacketWriter', () => {
  describe('MPacketHeader round-trip', () => {
    it('should write and read a packet header correctly', () => {
      // Manually construct a header buffer (bypassing writeHeader which uses getHashByte/getTimeStamp)
      const buf = Buffer.alloc(HEADER_SIZE);
      buf.writeUInt16LE(12, 0); // Size
      buf.writeUInt8(0x42, 2); // Key
      buf.writeUInt8(0xab, 3); // CheckSum
      buf.writeUInt16LE(0x20d, 4); // Opcode
      buf.writeUInt16LE(100, 6); // ClientId
      buf.writeInt32LE(-5000, 8); // TimeStamp

      const reader = new PacketReader(buf);
      const header = reader.readHeader();

      expect(header.size).toBe(12);
      expect(header.key).toBe(0x42);
      expect(header.checkSum).toBe(0xab);
      expect(header.opcode).toBe(0x20d);
      expect(header.clientId).toBe(100);
      expect(header.timeStamp).toBe(-5000);
    });

    it('should have reader at position 12 after reading header', () => {
      const buf = Buffer.alloc(HEADER_SIZE);
      const reader = new PacketReader(buf);
      reader.readHeader();
      expect(reader.position).toBe(HEADER_SIZE);
    });
  });

  describe('MScore round-trip', () => {
    it('should write and read an MScore struct correctly', () => {
      // MScore binary layout:
      // Level(4) + Defense(4) + Damage(4) + Merchant(1) + MovementSpeed(1) + Direction(1) + ChaosRate(1)
      // + MaxHp(4) + MaxMp(4) + CurrHp(4) + CurrMp(4) + Str(2) + Int(2) + Dex(2) + Con(2)
      // + Special[4] (2*4=8) = 48 bytes total
      const scoreSize = 48;
      const buf = Buffer.alloc(scoreSize);
      let off = 0;

      // Write expected values
      buf.writeInt32LE(TEST_SCORE.level, off);
      off += 4;
      buf.writeInt32LE(TEST_SCORE.defense, off);
      off += 4;
      buf.writeInt32LE(TEST_SCORE.damage, off);
      off += 4;
      buf.writeUInt8(TEST_SCORE.merchant, off);
      off += 1;
      buf.writeUInt8(TEST_SCORE.movementSpeed, off);
      off += 1;
      buf.writeUInt8(TEST_SCORE.direction, off);
      off += 1;
      buf.writeUInt8(TEST_SCORE.chaosRate, off);
      off += 1;
      buf.writeInt32LE(TEST_SCORE.maxHp, off);
      off += 4;
      buf.writeInt32LE(TEST_SCORE.maxMp, off);
      off += 4;
      buf.writeInt32LE(TEST_SCORE.currHp, off);
      off += 4;
      buf.writeInt32LE(TEST_SCORE.currMp, off);
      off += 4;
      buf.writeInt16LE(TEST_SCORE.str, off);
      off += 2;
      buf.writeInt16LE(TEST_SCORE.int, off);
      off += 2;
      buf.writeInt16LE(TEST_SCORE.dex, off);
      off += 2;
      buf.writeInt16LE(TEST_SCORE.con, off);
      off += 2;
      buf.writeInt16LE(TEST_SCORE.special[0], off);
      off += 2;
      buf.writeInt16LE(TEST_SCORE.special[1], off);
      off += 2;
      buf.writeInt16LE(TEST_SCORE.special[2], off);
      off += 2;
      buf.writeInt16LE(TEST_SCORE.special[3], off);
      off += 2;

      const reader = new PacketReader(buf);
      const score = reader.readScore();

      expect(score.level).toBe(TEST_SCORE.level);
      expect(score.defense).toBe(TEST_SCORE.defense);
      expect(score.damage).toBe(TEST_SCORE.damage);
      expect(score.merchant).toBe(TEST_SCORE.merchant);
      expect(score.movementSpeed).toBe(TEST_SCORE.movementSpeed);
      expect(score.direction).toBe(TEST_SCORE.direction);
      expect(score.chaosRate).toBe(TEST_SCORE.chaosRate);
      expect(score.maxHp).toBe(TEST_SCORE.maxHp);
      expect(score.maxMp).toBe(TEST_SCORE.maxMp);
      expect(score.currHp).toBe(TEST_SCORE.currHp);
      expect(score.currMp).toBe(TEST_SCORE.currMp);
      expect(score.str).toBe(TEST_SCORE.str);
      expect(score.int).toBe(TEST_SCORE.int);
      expect(score.dex).toBe(TEST_SCORE.dex);
      expect(score.con).toBe(TEST_SCORE.con);
      expect(score.special).toEqual([...TEST_SCORE.special]);
    });

    it('reads attributes as unsigned (a buffed stat > 32767 stays positive)', () => {
      // 0xA628 = 42536: read as signed int16 this would wrap to -22999.
      const buf = Buffer.alloc(48);
      buf.writeUInt16LE(42536, 34); // int
      buf.writeUInt16LE(65535, 46); // special[3]

      const score = new PacketReader(buf).readScore();

      expect(score.int).toBe(42536);
      expect(score.special[3]).toBe(65535);
    });
  });

  describe('MPosition round-trip', () => {
    it('should write and read a position correctly', () => {
      const writer = new PacketWriter(4, security);
      writer.writePosition({ x: 2100, y: -500 });

      const reader = new PacketReader(writer.result);
      const pos = reader.readPosition();

      expect(pos.x).toBe(2100);
      expect(pos.y).toBe(-500);
    });

    it('should handle zero position', () => {
      const writer = new PacketWriter(4, security);
      writer.writePosition({ x: 0, y: 0 });

      const reader = new PacketReader(writer.result);
      const pos = reader.readPosition();

      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
    });

    it('should handle max int16 values', () => {
      const writer = new PacketWriter(4, security);
      writer.writePosition({ x: 32767, y: -32768 });

      const reader = new PacketReader(writer.result);
      const pos = reader.readPosition();

      expect(pos.x).toBe(32767);
      expect(pos.y).toBe(-32768);
    });
  });

  describe('string encoding (ASCII)', () => {
    it('should write and read a fixed-size string', () => {
      const writer = new PacketWriter(16, security);
      writer.writeFixedString('TestPlayer', 16);

      const reader = new PacketReader(writer.result);
      const name = reader.readFixedString(16);

      expect(name).toBe('TestPlayer');
    });

    it('should truncate strings longer than field size', () => {
      const writer = new PacketWriter(8, security);
      writer.writeFixedString('VeryLongPlayerName', 8);

      const reader = new PacketReader(writer.result);
      const name = reader.readFixedString(8);

      // writeFixedString reserves 1 byte for null, so max 7 chars
      expect(name).toBe('VeryLon');
    });

    it('should handle empty string', () => {
      const writer = new PacketWriter(16, security);
      writer.writeFixedString('', 16);

      const reader = new PacketReader(writer.result);
      const name = reader.readFixedString(16);

      expect(name).toBe('');
    });
  });

  describe('reader position advancement', () => {
    it('should advance position by 1 after readUInt8', () => {
      const reader = new PacketReader(Buffer.alloc(32));
      reader.readUInt8();
      expect(reader.position).toBe(1);
    });

    it('should advance position by 1 after readInt8', () => {
      const reader = new PacketReader(Buffer.alloc(32));
      reader.readInt8();
      expect(reader.position).toBe(1);
    });

    it('should advance position by 2 after readUInt16', () => {
      const reader = new PacketReader(Buffer.alloc(32));
      reader.readUInt16();
      expect(reader.position).toBe(2);
    });

    it('should advance position by 2 after readInt16', () => {
      const reader = new PacketReader(Buffer.alloc(32));
      reader.readInt16();
      expect(reader.position).toBe(2);
    });

    it('should advance position by 4 after readUInt32', () => {
      const reader = new PacketReader(Buffer.alloc(32));
      reader.readUInt32();
      expect(reader.position).toBe(4);
    });

    it('should advance position by 4 after readInt32', () => {
      const reader = new PacketReader(Buffer.alloc(32));
      reader.readInt32();
      expect(reader.position).toBe(4);
    });

    it('should advance position by 8 after readInt64', () => {
      const reader = new PacketReader(Buffer.alloc(32));
      reader.readInt64();
      expect(reader.position).toBe(8);
    });

    it('should correctly skip bytes', () => {
      const reader = new PacketReader(Buffer.alloc(32));
      reader.skip(10);
      expect(reader.position).toBe(10);
    });
  });

  describe('writer position advancement', () => {
    it('should advance position by 1 after writeUInt8', () => {
      const writer = new PacketWriter(64, security);
      writer.writeUInt8(0);
      expect(writer.position).toBe(1);
    });

    it('should advance position by 1 after writeInt8', () => {
      const writer = new PacketWriter(64, security);
      writer.writeInt8(0);
      expect(writer.position).toBe(1);
    });

    it('should advance position by 2 after writeUInt16', () => {
      const writer = new PacketWriter(64, security);
      writer.writeUInt16(0);
      expect(writer.position).toBe(2);
    });

    it('should advance position by 2 after writeInt16', () => {
      const writer = new PacketWriter(64, security);
      writer.writeInt16(0);
      expect(writer.position).toBe(2);
    });

    it('should advance position by 4 after writeUInt32', () => {
      const writer = new PacketWriter(64, security);
      writer.writeUInt32(0);
      expect(writer.position).toBe(4);
    });

    it('should advance position by 4 after writeInt32', () => {
      const writer = new PacketWriter(64, security);
      writer.writeInt32(0);
      expect(writer.position).toBe(4);
    });

    it('should advance position by 8 after writeInt64', () => {
      const writer = new PacketWriter(64, security);
      writer.writeInt64(0n);
      expect(writer.position).toBe(8);
    });
  });

  describe('readBytes', () => {
    it('should read a byte slice and advance position', () => {
      const buf = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee]);
      const reader = new PacketReader(buf);

      const bytes = reader.readBytes(3);
      expect(bytes).toEqual(Buffer.from([0xaa, 0xbb, 0xcc]));
      expect(reader.position).toBe(3);
    });
  });

  describe('finalizeHeader', () => {
    it('should set size field to current writer position', () => {
      const writer = new PacketWriter(32, security);
      writer.writeUInt16(0); // Size placeholder
      writer.writeUInt8(0); // Key
      writer.writeUInt8(0); // CheckSum
      writer.writeUInt16(0x333); // Opcode
      writer.writeUInt16(1); // ClientId
      writer.writeInt32(0); // TimeStamp
      writer.writeFixedString('Hello', 16); // Payload

      writer.finalizeHeader();

      const result = writer.result;
      const writtenSize = result.readUInt16LE(0);
      expect(writtenSize).toBe(writer.position);
      expect(writtenSize).toBe(28); // 12 header + 16 string
    });
  });

  describe('bigint (int64) round-trip', () => {
    it('should write and read bigint values', () => {
      const writer = new PacketWriter(8, security);
      writer.writeInt64(1234567890123456789n);

      const reader = new PacketReader(writer.result);
      expect(reader.readInt64()).toBe(1234567890123456789n);
    });

    it('should handle negative bigint', () => {
      const writer = new PacketWriter(8, security);
      writer.writeInt64(-9999999999n);

      const reader = new PacketReader(writer.result);
      expect(reader.readInt64()).toBe(-9999999999n);
    });
  });
});
