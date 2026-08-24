/**
 * LIVENESS: client→server idle keepalive (opcode 0x3A0)
 *
 * The WYD2 server closes a connection after ~370 s of CLIENT→SERVER silence — an
 * application-level idle timeout that OS TCP keepalive does not satisfy. The
 * game avoids it by periodically emitting a 12-byte 0x3A0 packet
 * while idle.
 *
 * We mirror that with a coarse interval timer: when outbound has been silent
 * past IDLE_THRESHOLD_MS, re-send 0x3A0. Any real outbound packet re-arms the
 * clock, so during active play this never fires. Owned by SessionManager:
 * started on world entry, stopped on cleanup.
 *
 * See — Idle keepalive".
 */
import type { ClientConnection, ClientControl } from '@main/protocol';
import { protocolLogger, sessionLogger } from '../logging';

/** Re-send 0x3A0 after this much client→server silence — comfortably under the server's ~370 s idle close. */
const IDLE_THRESHOLD_MS = 240_000;

/** Poll cadence; worst-case send lands ~CHECK_INTERVAL_MS after the threshold. */
const CHECK_INTERVAL_MS = 30_000;

export class KeepAlive {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly connection: ClientConnection,
    private readonly control: ClientControl,
  ) {}

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), CHECK_INTERVAL_MS);
    sessionLogger.info('KeepAlive started');
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    sessionLogger.info('KeepAlive stopped');
  }

  private tick(): void {
    if (!this.connection.isConnected) return;
    const idleMs = Date.now() - this.connection.lastSendTime;
    if (idleMs < IDLE_THRESHOLD_MS) return;
    this.control.keepAlive();
    protocolLogger.debug(`[keepalive] 0x3A0 sent after ${idleMs}ms outbound silence`);
  }
}
