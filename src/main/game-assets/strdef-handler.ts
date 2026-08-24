import * as fs from 'fs/promises';
import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import { getResourcePath } from '@main/lib';
import { assetsReady } from '@main/asset-update/asset-ready';
import { secureEmptyInvoke } from '@main/ipc/secure-handler';
import { assetsLogger } from '../logging';

const FILE_PATH = getResourcePath('strdef.bin');
const ENTRY_COUNT = 2000;
const ENTRY_SIZE = 128;
const EXPECTED_SIZE = ENTRY_COUNT * ENTRY_SIZE;

const parseStrdef = (raw: Buffer): string[] => {
  const entries: string[] = new Array(ENTRY_COUNT);
  for (let i = 0; i < ENTRY_COUNT; i++) {
    const start = i * ENTRY_SIZE;
    const end = start + ENTRY_SIZE;
    let nullIdx = start;
    while (nullIdx < end && raw[nullIdx] !== 0) nullIdx++;
    entries[i] = raw.toString('latin1', start, nullIdx);
  }
  return entries;
};

let cached: string[] | undefined;

export const registerStrdefHandler = (): void => {
  ipcMain.handle(
    IPC.STRDEF_LOAD,
    secureEmptyInvoke(async () => {
      if (cached) return cached;
      await assetsReady();

      let buf: Buffer;
      try {
        buf = await fs.readFile(FILE_PATH);
      } catch (err) {
        throw new Error(
          `Failed to read strdef.bin at ${FILE_PATH}: ${err instanceof Error ? err.message : err}`,
        );
      }

      if (buf.length < EXPECTED_SIZE) {
        throw new Error(
          `strdef.bin is truncated: expected ${EXPECTED_SIZE} bytes, got ${buf.length}`,
        );
      }

      if (buf.length > EXPECTED_SIZE) {
        assetsLogger.warn(
          `strdef.bin larger than expected: ${buf.length} bytes (expected ${EXPECTED_SIZE})`,
        );
      }

      cached = parseStrdef(buf);
      assetsLogger.info(`Strdef loaded: ${ENTRY_COUNT} entries`);
      return cached;
    }),
  );
};
