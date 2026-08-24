import type { IpcChannel } from '@shared/ipc/ipc-channels';
import type { IpcOutboundMap } from '@shared/ipc/ipc-channel-map';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Listener = (...args: any[]) => void;

/** Electron ipcMain.on wrapper — cross-process, channel must be a known IpcChannel. */
export type IpcListenFn = (channel: IpcChannel, fn: Listener) => void;

/**
 * Electron webContents.send wrapper — cross-process, typed by IpcOutboundMap.
 *
 * Channels mapped to `undefined` are called with no payload argument.
 * All other channels require exactly the payload type declared in IpcOutboundMap.
 */
export type IpcSendFn = <C extends keyof IpcOutboundMap>(
  channel: C,
  ...args: IpcOutboundMap[C] extends undefined ? [] : [payload: IpcOutboundMap[C]]
) => void;

export type SafeHandlerFn = <T extends unknown[]>(
  fn: (...args: T) => void | Promise<void>,
) => (...args: T) => void;
