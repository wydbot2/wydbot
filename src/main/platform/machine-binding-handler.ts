import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import { HardwareIdentitySeedSchema } from '@shared/ipc/schemas';
import { secureEmptyInvoke, secureInvoke } from '@main/ipc/secure-handler';
import { getMachineBindingKey, getSessionMacPreview } from './hardware-identity';

/** Renderer reconnect-bag key — do not log the value. */
export const registerMachineBindingHandler = (): void => {
  ipcMain.handle(
    IPC.MACHINE_BINDING_KEY,
    secureEmptyInvoke(async () => getMachineBindingKey()),
  );
  ipcMain.handle(
    IPC.HARDWARE_IDENTITY_PREVIEW,
    secureInvoke(HardwareIdentitySeedSchema, async (_event, identitySeed) => ({
      mac: getSessionMacPreview(identitySeed),
    })),
  );
};
