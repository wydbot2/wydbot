import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';

const trustedSenderIds = new Set<number>();

export const registerTrustedSender = (webContentsId: number): void => {
  trustedSenderIds.add(webContentsId);
};

export const unregisterTrustedSender = (webContentsId: number): void => {
  trustedSenderIds.delete(webContentsId);
};

export const isTrustedSender = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
  trustedSenderIds.has(event.sender.id);

export class UntrustedSenderError extends Error {
  constructor(senderId: number) {
    super(`IPC rejected: untrusted sender (webContents id ${senderId})`);
    this.name = 'UntrustedSenderError';
  }
}

export const assertTrustedSender = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
  if (!trustedSenderIds.has(event.sender.id)) {
    throw new UntrustedSenderError(event.sender.id);
  }
};
