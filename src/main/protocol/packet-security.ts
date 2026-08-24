// KeyTable is process-wide via crypto-material-store.
import { protocolLogger } from '../logging';
import { getKeyTable } from './crypto-material-store';

/** Random key byte (0..255) — matches canonical `rand() & 0xff` for the zero-hash substitution. */
const randomKeyByte = (): number => (Math.random() * 0x100) | 0;

export class PacketSecurity {
  private lastPacketTick = Date.now();
  private timePacket = 0;
  private hashTable: Uint8Array | null = null;
  private hashIncrement = -1;
  private challengeValue = 0;
  private _lastLoggedPhase = -1;

  public setLastPacket(tick: number): void {
    this.lastPacketTick = tick;
  }

  public setTimePacket(ts: number): void {
    this.timePacket = ts;
  }

  public getTimeStamp(): number {
    return (this.timePacket + (Date.now() - this.lastPacketTick)) | 0;
  }

  public setChallengeValue(value: number): void {
    this.challengeValue = value;
    protocolLogger.debug(`Challenge value set: 0x${(value >>> 0).toString(16).toUpperCase()}`);
  }

  public setHashTable(table: Uint8Array): void {
    if (table.length !== 16) {
      throw new Error('HashTable must be exactly 16 bytes');
    }
    this.hashTable = table;
    this.hashIncrement = 0;
  }

  public getHashByte(): number {
    let hash = 0;
    let phase = 0;

    if (this.hashTable !== null && this.hashTable[0] !== 0) {
      if (this.hashIncrement <= 15) {
        // Phase 1: first 16 packets use the login hash table directly (peek; advanceHashByte() steps the index).
        phase = 1;
        hash = (this.hashTable[this.hashIncrement] ^ 0xff) & 0xff;
      } else if (this.challengeValue !== 0) {
        // Phase 3: after challenge received, derive hash from challengeValue
        phase = 3;
        const b0 = ((this.challengeValue & 0xff) << 24) >> 24;
        const b1 = (((this.challengeValue >> 8) & 0xff) << 24) >> 24;
        const b2 = (((this.challengeValue >> 16) & 0xff) << 24) >> 24;
        const b3 = (((this.challengeValue >> 24) & 0xff) << 24) >> 24;

        let multiplier = b0;
        if (b0 === 0 && b3 === 0) multiplier = 0x0d;

        let result = b2 - b1 * multiplier + b3;
        if (result === 0) result = b0;

        hash = (result ^ 0xff) & 0xff;
      } else {
        // Phase 2: packets 16+ before challenge — static fallback
        phase = 2;
        switch (this.hashTable[15] & 1) {
          case 0:
            hash = (this.hashTable[1] + this.hashTable[3] + this.hashTable[5] - 87) & 0xff;
            break;
          case 1:
            hash = (this.hashTable[13] + this.hashTable[11] - this.hashTable[9] + 4) & 0xff;
            break;
        }
        hash = (hash ^ 0xff) & 0xff;
      }
    }

    // Log phase transitions and first few calls
    if (this.hashIncrement <= 17 || phase !== this._lastLoggedPhase) {
      protocolLogger.debug(
        `getHashByte() phase=${phase} hash=0x${hash.toString(16).toUpperCase()} increment=${this.hashIncrement}`,
      );
      this._lastLoggedPhase = phase;
    }

    return hash;
  }

  /** Step the Phase-1 counter once per packet actually written (TcpClient.send, post-drop-checks). Assumes peek-order == send-order. */
  public advanceHashByte(): void {
    if (this.hashTable !== null && this.hashTable[0] !== 0 && this.hashIncrement <= 15) {
      this.hashIncrement++;
    }
  }

  public decrypt(buffer: Buffer, offset = 0): boolean {
    const KEY_TABLE = getKeyTable();
    const packetSize = buffer.readUInt16LE(offset);
    let keyIncrement = KEY_TABLE[buffer[2 + offset] * 2];
    let checksumEnc = 0;
    let checksumDec = 0;

    for (let i = 4; i < packetSize; i++, keyIncrement++) {
      checksumEnc = (checksumEnc + buffer[i + offset]) & 0xff;

      const keyResult = KEY_TABLE[(keyIncrement & 0xff) * 2 + 1];

      switch (i & 3) {
        case 0:
          buffer[i + offset] = (buffer[i + offset] - ((keyResult << 1) & 0xff)) & 0xff;
          break;
        case 1:
          buffer[i + offset] = (buffer[i + offset] + (keyResult >> 3)) & 0xff;
          break;
        case 2:
          buffer[i + offset] = (buffer[i + offset] - ((keyResult << 2) & 0xff)) & 0xff;
          break;
        case 3:
          buffer[i + offset] = (buffer[i + offset] + (keyResult >> 5)) & 0xff;
          break;
      }

      checksumDec = (checksumDec + buffer[i + offset]) & 0xff;
    }

    return buffer[3 + offset] === ((checksumEnc - checksumDec) & 0xff);
  }

  public encrypt(buffer: Buffer, nextKeyByte: () => number = randomKeyByte): void {
    const KEY_TABLE = getKeyTable();
    const packetSize = buffer.readUInt16LE(0);

    if (buffer.length < 12 || packetSize < 12) return;

    // game never sends key@2 == 0 — substitute a random byte (rand() & 0xff).
    if (buffer[2] === 0) {
      buffer[2] = nextKeyByte() & 0xff;
    }

    let checksumEnc = 0;
    let checksumDec = 0;
    const hashKey = buffer[2];
    let keyIncrement = KEY_TABLE[hashKey * 2] & 0xff;

    for (let offset = 4; offset < packetSize; offset++, keyIncrement++) {
      checksumDec = (checksumDec + buffer[offset]) & 0xff;

      const keyResult = KEY_TABLE[(keyIncrement & 0xff) * 2 + 1];

      switch (offset & 3) {
        case 0:
          buffer[offset] = (buffer[offset] + ((keyResult * 2) & 0xff)) & 0xff;
          break;
        case 1:
          buffer[offset] = (buffer[offset] - (keyResult >> 3)) & 0xff;
          break;
        case 2:
          buffer[offset] = (buffer[offset] + ((keyResult * 4) & 0xff)) & 0xff;
          break;
        case 3:
          buffer[offset] = (buffer[offset] - (keyResult >> 5)) & 0xff;
          break;
      }

      checksumEnc = (checksumEnc + buffer[offset]) & 0xff;
    }

    buffer[3] = (checksumEnc - checksumDec) & 0xff;
  }

  public reset(): void {
    this.lastPacketTick = Date.now();
    this.timePacket = 0;
    this.hashTable = null;
    this.hashIncrement = -1;
    this.challengeValue = 0;
  }
}
