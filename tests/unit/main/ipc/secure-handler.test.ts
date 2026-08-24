import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

// secure-handler pulls in ipcLogger from '../logging' (winston + file transport)
// at import time — stub it so the test never touches the real logging stack.
vi.mock('@main/logging', () => ({
  ipcLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { secureEmptyInvoke, secureInvoke, secureListener } from '@main/ipc/secure-handler';
import { ipcLogger } from '@main/logging';
import {
  registerTrustedSender,
  unregisterTrustedSender,
  UntrustedSenderError,
} from '@main/ipc/sender-validation';

const TRUSTED = 1;
const UNTRUSTED = 99;
const evt = (id: number): IpcMainInvokeEvent =>
  ({ sender: { id } }) as unknown as IpcMainInvokeEvent;

afterEach(() => {
  unregisterTrustedSender(TRUSTED);
});

describe('secureEmptyInvoke', () => {
  it('runs the handler and returns its value for a trusted sender', async () => {
    registerTrustedSender(TRUSTED);
    const handler = vi.fn(() => 'ok');
    const wrapped = secureEmptyInvoke(handler);

    await expect(wrapped(evt(TRUSTED))).resolves.toBe('ok');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects an untrusted sender and never calls the handler', async () => {
    const handler = vi.fn(() => 'ok');
    const wrapped = secureEmptyInvoke(handler);

    await expect(wrapped(evt(UNTRUSTED))).rejects.toBeInstanceOf(UntrustedSenderError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('secureInvoke', () => {
  const schema = z.object({ n: z.number() });

  it('validates the payload and hands parsed data to a trusted handler', async () => {
    registerTrustedSender(TRUSTED);
    const handler = vi.fn((_e: IpcMainInvokeEvent, p: { n: number }) => p.n * 2);
    const wrapped = secureInvoke(schema, handler);

    await expect(wrapped(evt(TRUSTED), { n: 21 })).resolves.toBe(42);
    expect(handler).toHaveBeenCalledWith(expect.anything(), { n: 21 });
  });

  it('rejects an untrusted sender BEFORE parsing the payload', async () => {
    const handler = vi.fn();
    const wrapped = secureInvoke(schema, handler);

    await expect(wrapped(evt(UNTRUSTED), { n: 1 })).rejects.toBeInstanceOf(UntrustedSenderError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws on an invalid payload even from a trusted sender', async () => {
    registerTrustedSender(TRUSTED);
    const handler = vi.fn();
    const wrapped = secureInvoke(schema, handler);

    await expect(wrapped(evt(TRUSTED), { n: 'nope' })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('secureListener', () => {
  const schema = z.object({ n: z.number() });
  const listenEvt = (id: number): IpcMainEvent => ({ sender: { id } }) as unknown as IpcMainEvent;

  it('runs the listener for a trusted sender with a valid payload', () => {
    registerTrustedSender(TRUSTED);
    const listener = vi.fn();
    secureListener(schema, listener)(listenEvt(TRUSTED), { n: 1 });
    expect(listener).toHaveBeenCalledWith(expect.anything(), { n: 1 });
  });

  it('logs and swallows a listener throw instead of propagating it', () => {
    registerTrustedSender(TRUSTED);
    const listener = vi.fn(() => {
      throw new Error('boom');
    });
    expect(() => secureListener(schema, listener)(listenEvt(TRUSTED), { n: 1 })).not.toThrow();
    expect(vi.mocked(ipcLogger.error)).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
