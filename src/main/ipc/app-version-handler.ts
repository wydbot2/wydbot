import { app, ipcMain } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import { secureEmptyInvoke } from './secure-handler';

export const registerAppVersionHandler = (): void => {
  ipcMain.handle(
    IPC.APP_VERSION,
    secureEmptyInvoke(() => app.getVersion()),
  );
};
