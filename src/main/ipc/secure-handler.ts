// secureListener drops invalid payloads silently (denies an attacker the
// oracle of which shapes pass validation). secureInvoke throws because the
// renderer is awaiting a response and silent drop would hang it.
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';
import { ipcLogger } from '../logging';
import { assertTrustedSender, isTrustedSender } from './sender-validation';

type SecureListener<T> = (event: IpcMainEvent, payload: T) => void;
type SecureEmptyListener = (event: IpcMainEvent) => void;

export const secureListener = <T>(
  schema: ZodType<T>,
  listener: SecureListener<T>,
  channel = '?',
): ((event: IpcMainEvent, raw: unknown) => void) => {
  return (event, raw) => {
    if (!isTrustedSender(event)) {
      ipcLogger.warn(`IPC listener rejected [${channel}] (untrusted sender id=${event.sender.id})`);
      return;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      ipcLogger.warn(`IPC payload invalid [${channel}]: ${parsed.error.message.slice(0, 256)}`);
      return;
    }
    try {
      listener(event, parsed.data);
    } catch (err) {
      // Listeners are fire-and-forget (`send`, no reply) — an uncaught throw
      // would otherwise surface only as a main-process uncaughtException with
      // no IPC context, looking identical to a dead button in the renderer.
      ipcLogger.error(
        `IPC listener threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
  };
};

export const secureEmptyListener = (
  listener: SecureEmptyListener,
): ((event: IpcMainEvent) => void) => {
  return (event) => {
    if (!isTrustedSender(event)) {
      ipcLogger.warn(`IPC listener rejected (untrusted sender id=${event.sender.id})`);
      return;
    }
    listener(event);
  };
};

type SecureInvokeHandler<T, R> = (event: IpcMainInvokeEvent, payload: T) => R | Promise<R>;
type SecureEmptyInvokeHandler<R> = (event: IpcMainInvokeEvent) => R | Promise<R>;

export const secureInvoke = <T, R>(
  schema: ZodType<T>,
  handler: SecureInvokeHandler<T, R>,
): ((event: IpcMainInvokeEvent, raw: unknown) => Promise<R>) => {
  return async (event, raw) => {
    assertTrustedSender(event);
    const parsed = schema.parse(raw);
    return handler(event, parsed);
  };
};

export const secureEmptyInvoke = <R>(
  handler: SecureEmptyInvokeHandler<R>,
): ((event: IpcMainInvokeEvent) => Promise<R>) => {
  return async (event) => {
    assertTrustedSender(event);
    return handler(event);
  };
};
