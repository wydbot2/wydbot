import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import type { IpcBootProgress } from '@shared/ipc/ipc-api';
import { secureEmptyInvoke } from './secure-handler';

const consumers = new Set<BrowserWindow>();
let lastState: IpcBootProgress | null = null;

export const registerBootProgressConsumer = (win: BrowserWindow): void => {
  consumers.add(win);
  win.once('closed', () => {
    consumers.delete(win);
  });
};

export const emitBootProgress = (payload: IpcBootProgress): void => {
  lastState = payload;
  for (const win of consumers) {
    if (win.isDestroyed()) {
      consumers.delete(win);
      continue;
    }
    win.webContents.send(IPC.BOOT_PROGRESS, payload);
  }
};

export const registerBootProgressSnapshotHandler = (): void => {
  ipcMain.handle(
    IPC.BOOT_PROGRESS_SNAPSHOT,
    secureEmptyInvoke(() => lastState),
  );
};
