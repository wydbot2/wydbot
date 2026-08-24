import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';

// Capture the handler electron would register so we can drive it directly.
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3' },
  ipcMain: {
    handle: (channel: string, fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown) =>
      handlers.set(channel, fn),
  },
}));
vi.mock('@main/logging', () => ({
  ipcLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { IPC } from '@shared/ipc/ipc-channels';
import { registerAppVersionHandler } from '@main/ipc/app-version-handler';
import {
  registerTrustedSender,
  unregisterTrustedSender,
  UntrustedSenderError,
} from '@main/ipc/sender-validation';

const TRUSTED = 7;
const evt = (id: number): IpcMainInvokeEvent =>
  ({ sender: { id } }) as unknown as IpcMainInvokeEvent;

// A representative read-only getter: proves the invoke handler is actually
// routed through the trusted-sender wrapper, not registered bare.
describe('registerAppVersionHandler (wired through secureEmptyInvoke)', () => {
  afterEach(() => {
    unregisterTrustedSender(TRUSTED);
    handlers.clear();
  });

  it('rejects an untrusted sender', async () => {
    registerAppVersionHandler();
    const handler = handlers.get(IPC.APP_VERSION);
    expect(handler).toBeDefined();
    await expect(handler!(evt(123))).rejects.toBeInstanceOf(UntrustedSenderError);
  });

  it('returns the app version for the trusted sender', async () => {
    registerTrustedSender(TRUSTED);
    registerAppVersionHandler();
    const handler = handlers.get(IPC.APP_VERSION);
    await expect(handler!(evt(TRUSTED))).resolves.toBe('1.2.3');
  });
});
