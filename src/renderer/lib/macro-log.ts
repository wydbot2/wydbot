import type { IpcLogEntry } from '@shared/ipc/ipc-api';
import { getWydAPI } from './electron-api';

export const logMacro = (level: 'info' | 'warn' | 'error', message: string): void => {
  getWydAPI()?.sendRendererLog?.({
    level,
    message,
    timestamp: new Date().toISOString(),
    category: 'macro',
  } satisfies IpcLogEntry);
};
