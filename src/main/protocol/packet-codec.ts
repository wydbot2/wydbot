import type {
  MPacketHeader,
  MPosition,
  MScore,
  MSelChar,
  MobName,
} from '@shared/types/game-structures';
import type { MItem, MItemEffect, MEquip } from '@shared/types/item-types';
import type { MAffect, MAffectPacket } from '@shared/types/affect-types';
import { MAXL_EQUIP, MAXL_ACC_MOB } from '@shared/constants/game-basics';
import type { PacketSecurity } from './packet-security';

export class PacketReader {
  private offset: number;

  constructor(
    private readonly buffer: Buffer,
    initialOffset = 0,
  ) {
    this.offset = initialOffset;
  }

  public get position(): number {
    return this.offset;
  }

  public readUInt8(): number {
    const v = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  public readInt8(): number {
    const v = this.buffer.readInt8(this.offset);
    this.offset += 1;
    return v;
  }

  public readUInt16(): number {
    const v = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  public readInt16(): number {
    const v = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  public readUInt32(): number {
    const v = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  public readInt32(): number {
    const v = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  public readInt64(): bigint {
    const v = this.buffer.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  public readBytes(count: number): Buffer {
    const v = this.buffer.subarray(this.offset, this.offset + count);
    this.offset += count;
    return Buffer.from(v);
  }

  public readFixedString(fieldSize: number): string {
    const raw = this.buffer.subarray(this.offset, this.offset + fieldSize);
    this.offset += fieldSize;
    const nullIdx = raw.indexOf(0);
    return raw.subarray(0, nullIdx >= 0 ? nullIdx : fieldSize).toString('ascii');
  }

  public skip(bytes: number): void {
    this.offset += bytes;
  }

  public readHeader(): MPacketHeader {
    return {
      size: this.readUInt16(),
      key: this.readUInt8(),
      checkSum: this.readUInt8(),
      opcode: this.readUInt16(),
      clientId: this.readUInt16(),
      timeStamp: this.readInt32(),
    };
  }

  public readPosition(): MPosition {
    return {
      x: this.readInt16(),
      y: this.readInt16(),
    };
  }

  public readItemEffect(): MItemEffect {
    return {
      index: this.readUInt8(),
      value: this.readUInt8(),
    };
  }

  /**
   * 12 bytes on wire: u16 itemId + i16 stackCount + u16 field04 + 3 × {u8 idx, u8 val}.
   */
  public readItem(): MItem {
    const index = this.readUInt16();
    const rawStack = this.readInt16();
    const stackCount = rawStack >= 1 && rawStack <= 500 ? rawStack : 1;
    const field04 = this.readUInt16();
    return {
      index,
      stackCount,
      field04,
      effects: [this.readItemEffect(), this.readItemEffect(), this.readItemEffect()],
    };
  }

  public readEquip(): MEquip {
    const items: MItem[] = [];
    for (let i = 0; i < MAXL_EQUIP; i++) {
      items.push(this.readItem());
    }
    return { items };
  }

  /** 48 bytes — uniform across all packets (MSelChar, CharToWorld, RefreshScore, CreateMob) */
  public readScore(): MScore {
    return {
      level: this.readInt32(),
      defense: this.readInt32(),
      damage: this.readInt32(),
      merchant: this.readUInt8(),
      movementSpeed: Math.min(Math.max(this.readUInt8() & 0x0f, 1), 7),
      direction: this.readUInt8(),
      chaosRate: this.readUInt8(),
      maxHp: this.readInt32(),
      maxMp: this.readInt32(),
      currHp: this.readInt32(),
      currMp: this.readInt32(),
      str: this.readUInt16(),
      int: this.readUInt16(),
      dex: this.readUInt16(),
      con: this.readUInt16(),
      special: [this.readUInt16(), this.readUInt16(), this.readUInt16(), this.readUInt16()],
    };
  }

  public readAffect(): MAffect {
    return {
      type: this.readUInt8(),
      value: this.readUInt8(),
      level: this.readUInt16(),
      time: this.readUInt32(),
    };
  }

  public readAffectPacket(): MAffectPacket {
    return {
      timeOctets: this.readUInt8(),
      type: this.readUInt8(),
    };
  }

  public readMobName(): MobName {
    return { name: this.readFixedString(16) };
  }

  /** 1208 bytes on wire */
  public readSelChar(): MSelChar {
    const posX: number[] = [];
    const posY: number[] = [];
    for (let i = 0; i < MAXL_ACC_MOB; i++) posX.push(this.readInt16());
    for (let i = 0; i < MAXL_ACC_MOB; i++) posY.push(this.readInt16());

    const names: MobName[] = [];
    for (let i = 0; i < MAXL_ACC_MOB; i++) names.push(this.readMobName());

    const scores: MScore[] = [];
    for (let i = 0; i < MAXL_ACC_MOB; i++) scores.push(this.readScore());

    const equips: MEquip[] = [];
    for (let i = 0; i < MAXL_ACC_MOB; i++) equips.push(this.readEquip());

    const transformIds: number[] = [];
    for (let i = 0; i < MAXL_ACC_MOB; i++) transformIds.push(this.readUInt16());

    const guilds: number[] = [];
    for (let i = 0; i < MAXL_ACC_MOB; i++) guilds.push(this.readInt32());

    const coins: number[] = [];
    for (let i = 0; i < MAXL_ACC_MOB; i++) coins.push(this.readInt32());

    const exps: bigint[] = [];
    for (let i = 0; i < MAXL_ACC_MOB; i++) exps.push(this.readInt64());

    return { posX, posY, names, scores, equips, transformIds, guilds, coins, exps };
  }
}

export class PacketWriter {
  private buffer: Buffer;
  private offset: number;

  constructor(
    size: number,
    private readonly security: PacketSecurity,
  ) {
    this.buffer = Buffer.alloc(size);
    this.offset = 0;
  }

  public get result(): Buffer {
    return this.buffer;
  }

  public get position(): number {
    return this.offset;
  }

  public writeUInt8(v: number): void {
    this.buffer.writeUInt8(v & 0xff, this.offset);
    this.offset += 1;
  }

  public writeInt8(v: number): void {
    this.buffer.writeInt8(v, this.offset);
    this.offset += 1;
  }

  public writeUInt16(v: number): void {
    this.buffer.writeUInt16LE(v & 0xffff, this.offset);
    this.offset += 2;
  }

  public writeInt16(v: number): void {
    this.buffer.writeInt16LE(v, this.offset);
    this.offset += 2;
  }

  public writeUInt32(v: number): void {
    this.buffer.writeUInt32LE(v >>> 0, this.offset);
    this.offset += 4;
  }

  public writeInt32(v: number): void {
    this.buffer.writeInt32LE(v, this.offset);
    this.offset += 4;
  }

  public writeInt64(v: bigint): void {
    this.buffer.writeBigInt64LE(v, this.offset);
    this.offset += 8;
  }

  public writeBytes(data: Buffer | Uint8Array, size?: number): void {
    const len = size ?? data.length;
    Buffer.from(data).copy(this.buffer, this.offset, 0, Math.min(data.length, len));
    this.offset += len;
  }

  public writeFixedString(str: string, fieldSize: number): void {
    const encoded = Buffer.from(str, 'ascii');
    const toWrite = Math.min(encoded.length, fieldSize - 1);
    encoded.copy(this.buffer, this.offset, 0, toWrite);
    this.offset += fieldSize;
  }

  public skip(bytes: number): void {
    this.offset += bytes;
  }

  public writeHeader(opcode: number, clientId = 0): void {
    this.writeUInt16(0);
    this.writeUInt8(this.security.getHashByte());
    this.writeUInt8(0);
    this.writeUInt16(opcode);
    this.writeUInt16(clientId);
    this.writeInt32(this.security.getTimeStamp());
  }

  public writePosition(pos: MPosition): void {
    this.writeInt16(pos.x);
    this.writeInt16(pos.y);
  }

  public finalizeHeader(): void {
    this.buffer.writeUInt16LE(this.offset, 0);
  }
}
