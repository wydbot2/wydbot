import * as fs from 'fs/promises';
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import type { ServerChannel } from '@shared/constants/server-channels';
import { getResourcePath } from '@main/lib';
import { assetsReady } from '@main/asset-update/asset-ready';
import { secureEmptyInvoke } from '@main/ipc/secure-handler';
import { assetsLogger } from '../logging';

// Resolve at read time — not at module load. Module-top getResourcePath() can
// capture a wrong root if evaluated before app paths are stable (and freezes a
// stale path if env / store mode were to change).
const serverlistPath = (): string => getResourcePath('serverlist.bin');

const HEADER_SIZE = 4;
const RECORD_SIZE = 64; // 0x40
const CHANNELS_PER_GROUP = 11; // entry 0 = status URL, entries 1..10 = channel IPs
const MAX_GROUPS = 10;
const DATA_SIZE = RECORD_SIZE * CHANNELS_PER_GROUP * MAX_GROUPS; // 7040
const PORT = 8281;

/**
 * Decryption key for the serverlist channel table (63 bytes + 1 null).
 * The algorithm subtracts key[63-j] from data[j] for each byte in every 64-byte block.
 */
const DECRYPT_KEY = new Uint8Array([
  0xc1, 0xb6, 0xc0, 0xcc, 0xc0, 0xd3, 0xc6, 0xd1, 0xc6, 0xae, 0xbe, 0xcf, 0xc8, 0xa3, 0xc8, 0xad,
  0xc0, 0xdb, 0xbe, 0xf7, 0xc0, 0xbb, 0xc0, 0xa7, 0xc7, 0xd1, 0xbd, 0xba, 0xc5, 0xa9, 0xb8, 0xb3,
  0xc6, 0xae, 0xc0, 0xd4, 0xb4, 0xcf, 0xb4, 0xd9, 0xb8, 0xb8, 0xc7, 0xd1, 0xb1, 0xdb, 0xb7, 0xce,
  0xbe, 0xcf, 0xc8, 0xad, 0xc8, 0xad, 0xc7, 0xd2, 0xc1, 0xd9, 0xa4, 0xbb, 0xa4, 0xbb, 0x00, 0x00,
]);

const decrypt = (data: Buffer): void => {
  for (let offset = 0; offset < data.length; offset += RECORD_SIZE) {
    for (let j = 0; j < RECORD_SIZE && offset + j < data.length; j++) {
      data[offset + j] = (data[offset + j] - DECRYPT_KEY[63 - j]) & 0xff;
    }
  }
};

const readString = (data: Buffer, offset: number): string => {
  let end = offset;
  while (end < offset + RECORD_SIZE && data[end] !== 0) end++;
  return data.subarray(offset, end).toString('ascii');
};

const parseServerlist = (raw: Buffer): ServerChannel[] => {
  if (raw.length < HEADER_SIZE + DATA_SIZE) {
    throw new Error(
      `serverlist.bin too small: expected at least ${HEADER_SIZE + DATA_SIZE} bytes, got ${raw.length}`,
    );
  }

  const data = Buffer.from(raw.subarray(HEADER_SIZE, HEADER_SIZE + DATA_SIZE));
  decrypt(data);

  const channels: ServerChannel[] = [];

  for (let group = 0; group < MAX_GROUPS; group++) {
    const groupOffset = group * CHANNELS_PER_GROUP * RECORD_SIZE;

    // Entry 0 is the status URL — skip it
    // Entries 1..10 are channel IPs
    for (let ch = 1; ch < CHANNELS_PER_GROUP; ch++) {
      const ip = readString(data, groupOffset + ch * RECORD_SIZE);
      if (ip.length === 0) continue;

      channels.push({
        name: `Canal ${String(channels.length + 1).padStart(2, '0')}`,
        ip,
        port: PORT,
      });
    }
  }

  return channels;
};

let cached: ServerChannel[] | undefined;

export const registerServerlistHandler = (): void => {
  ipcMain.handle(
    IPC.SERVERLIST_LOAD,
    secureEmptyInvoke(async () => {
      if (cached) return cached;
      await assetsReady();

      const filePath = serverlistPath();
      let buf: Buffer;
      try {
        buf = await fs.readFile(filePath);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        assetsLogger.error(`Failed to read serverlist.bin at ${filePath}: ${detail}`);
        throw new Error(`Failed to read serverlist.bin at ${filePath}: ${detail}`);
      }

      cached = parseServerlist(buf);

      assetsLogger.info(`Serverlist loaded: ${cached.length} channels`);
      return cached;
    }),
  );
};
