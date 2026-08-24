import type { IpcLogEntry } from '@shared/ipc/ipc-api';
import { getWydAPI } from './electron-api';

export const logEntityLife = (level: 'info' | 'warn', message: string): void => {
  getWydAPI()?.sendRendererLog({
    level,
    message,
    timestamp: new Date().toISOString(),
    category: 'entity-life',
  } satisfies IpcLogEntry);
};
