import { ipcMain, type IpcMainEvent } from 'electron';
import { IPC, type IpcChannel } from '@shared/ipc/ipc-channels';
import type { AppError } from '@shared/ipc/ipc-api';
import { ConnectPayloadSchema } from '@shared/ipc/schemas';
import type { WindowRegistry } from '@main/window-registry';
import {
  registerItemDbHandler,
  registerComposeHandler,
  registerServerlistHandler,
  registerStrdefHandler,
} from '@main/game-assets';
import { registerAppConfigHandlers } from '@main/app-config';
import { registerMachineBindingHandler } from '@main/platform/machine-binding-handler';
import type { IconCacheManager } from '../cache/icons';
import { registerWalkabilityHandler } from './walkability-handler';
import { ipcLogger } from '../logging';
import { bindConnectionEvents } from './ipc-event-bridge';
import {
  connectThroughSocks5List,
  isProxyAbortError,
  type Socks5Tunnel,
} from '../protocol/socks5-proxy';
import { registerCommandHandlers } from './ipc-command-handlers';
import { secureEmptyListener, secureListener } from './secure-handler';
import type { IpcSendFn, Listener, SafeHandlerFn } from './ipc-types';

/**
 * Minimum interval (ms) between IPC calls per channel+sender. Only pre-game
 * connection channels are throttled here — in-game actions are rate-limited by
 * ActionQueue. Keyed per sender so one window's throttle never blocks another.
 */
const IPC_MIN_INTERVALS = new Map<string, number>([
  [IPC.CONNECT, 3000],
  [IPC.DISCONNECT, 3000],
]);

/**
 * Registered ONCE for the app: ipcMain channels are global, so each inbound event
 * resolves its owning window's session + outbound channel from the WindowRegistry
 * via `event.sender.id`. An untracked sender no-ops (cross-window isolation).
 */
export class IpcBridge {
  private readonly listenerRegistry: Array<[IpcChannel, Listener]> = [];
  private readonly handleRegistry: string[] = [];
  private readonly lastCallTimes = new Map<string, number>();

  constructor(
    private readonly registry: WindowRegistry,
    private readonly iconCache: IconCacheManager,
  ) {}

  public register(): void {
    this.on(
      IPC.CONNECT,
      secureListener(
        ConnectPayloadSchema,
        (event, payload) => {
          const senderId = event.sender.id;
          const ctx = this.registry.contextForSender(senderId);
          if (!ctx) return;
          // Reconnect guard — reject if this window already has an active connection.
          if (ctx.session.getConnection()?.isConnected) {
            ipcLogger.warn('Reconnect guard: active connection exists, ignoring CONNECT');
            return;
          }
          const attempt = ctx.session.beginConnectionAttempt();

          const connect = async (): Promise<void> => {
            let tunnel: Socks5Tunnel | null = null;
            try {
              tunnel = payload.proxy.enabled
                ? await connectThroughSocks5List({
                    listUrl: payload.proxy.listUrl,
                    target: { host: payload.server.ip, port: payload.server.port },
                    signal: attempt.signal,
                    onStatus: (status) => ctx.send(IPC.PROXY_CONNECTION_STATUS, status),
                  })
                : null;

              if (attempt.signal.aborted) {
                tunnel?.socket.destroy();
                return;
              }

              const routeTag = tunnel
                ? `wc=${senderId} proxy=${tunnel.proxy.host}:${tunnel.proxy.port} latency=${tunnel.latencyMs}ms`
                : `wc=${senderId}`;
              const { connection, control } = ctx.session.createConnection(
                payload.server.ip,
                payload.server.port,
                routeTag,
                tunnel?.socket ?? null,
                attempt,
              );
              bindConnectionEvents(
                connection,
                control,
                ctx.session,
                ctx.send,
                this.makeSafeHandler(ctx.send),
              );
              connection.connect();
              tunnel?.release();
            } catch (error) {
              ctx.session.endConnectionAttempt(attempt);
              tunnel?.socket.destroy();
              tunnel?.release();
              if (isProxyAbortError(error) || attempt.signal.aborted) return;

              ctx.session.cleanup();

              const message = error instanceof Error ? error.message : String(error);
              ipcLogger.error(`Connection preparation failed: ${message}`);
              if (payload.proxy.enabled) {
                ctx.send(IPC.PROXY_CONNECTION_STATUS, { phase: 'failed', message });
              } else {
                ctx.send(IPC.CONNECTION_STATUS, 'error');
              }
            }
          };

          void connect();
        },
        IPC.CONNECT,
      ),
    );

    this.on(
      IPC.DISCONNECT,
      secureEmptyListener((event) => {
        const ctx = this.registry.contextForSender(event.sender.id);
        if (!ctx) return;
        // Socket close is async; cleanup removes listeners first — notify now.
        ctx.send(IPC.CONNECTION_STATUS, 'disconnected');
        ctx.session.cleanup();
      }),
    );

    registerCommandHandlers(
      (event) => this.registry.contextForSender(event.sender.id),
      this.makeSafeHandler,
      this.on,
    );

    registerServerlistHandler();
    this.handleRegistry.push(IPC.SERVERLIST_LOAD);

    registerMachineBindingHandler();
    this.handleRegistry.push(IPC.MACHINE_BINDING_KEY, IPC.HARDWARE_IDENTITY_PREVIEW);

    registerStrdefHandler();
    this.handleRegistry.push(IPC.STRDEF_LOAD);

    registerWalkabilityHandler();
    this.handleRegistry.push(IPC.WALKABILITY_GET_HEIGHTMAP);

    registerItemDbHandler(this.iconCache);
    this.handleRegistry.push(IPC.DATA_GET_ITEM_DB);

    registerComposeHandler();
    this.handleRegistry.push(IPC.DATA_GET_COMPOSE_CATALOG);

    registerAppConfigHandlers();
    this.handleRegistry.push(IPC.APP_CONFIG_OPEN, IPC.APP_CONFIG_SAVE);
  }

  public cleanup(): void {
    for (const [channel, fn] of this.listenerRegistry) {
      ipcMain.removeListener(channel, fn);
    }
    this.listenerRegistry.length = 0;
    for (const channel of this.handleRegistry) {
      ipcMain.removeHandler(channel);
    }
    this.handleRegistry.length = 0;
    this.lastCallTimes.clear();
  }

  private readonly sendError = (send: IpcSendFn, err: unknown): void => {
    send(IPC.APP_ERROR, {
      code: 'IPC_ERROR',
      message: err instanceof Error ? err.message : String(err),
      severity: 'error',
    } satisfies AppError);
  };

  // Per-window error reporter: routes a handler's throw/rejection to the window
  // that owns the action. Arrow factory keeps `this` bound when passed around.
  private readonly makeSafeHandler =
    (send: IpcSendFn): SafeHandlerFn =>
    <T extends unknown[]>(fn: (...args: T) => void | Promise<void>) =>
    (...args: T): void => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          void (async () => {
            try {
              await result;
            } catch (err) {
              this.sendError(send, err);
            }
          })();
        }
      } catch (err) {
        this.sendError(send, err);
      }
    };

  private readonly on = (channel: IpcChannel, fn: Listener): void => {
    const minInterval = IPC_MIN_INTERVALS.get(channel);
    const wrapped: Listener = minInterval
      ? (...args: unknown[]) => {
          const senderId = (args[0] as IpcMainEvent | undefined)?.sender?.id ?? 0;
          const key = `${channel}:${senderId}`;
          const now = Date.now();
          const last = this.lastCallTimes.get(key) ?? 0;
          if (now - last < minInterval) {
            ipcLogger.warn(
              `IPC throttle: ${channel} dropped (${now - last}ms < ${minInterval}ms) sender=${senderId}`,
            );
            return;
          }
          this.lastCallTimes.set(key, now);
          fn(...args);
        }
      : fn;
    ipcMain.on(channel, wrapped);
    this.listenerRegistry.push([channel, wrapped]);
  };
}
