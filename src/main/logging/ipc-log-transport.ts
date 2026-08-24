import type { BrowserWindow } from 'electron';
import Transport from 'winston-transport';
import type { IpcLogEntry } from '@shared/ipc/ipc-api';
import { IPC } from '@shared/ipc/ipc-channels';

const FLUSH_INTERVAL_MS = 100;
const MAX_BUFFER_SIZE = 200;

/**
 * Winston transport that batches log entries and sends them to the renderer
 * process via IPC. Entries are buffered and flushed every 100ms or when the
 * buffer reaches 200 entries, whichever comes first.
 */
export class IpcLogTransport extends Transport {
  private readonly getWindow: () => BrowserWindow | null;
  private buffer: IpcLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(getWindow: () => BrowserWindow | null, opts?: Transport.TransportStreamOptions) {
    super(opts);
    this.getWindow = getWindow;
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  public log(
    info: { level: string; message: string; timestamp?: string; category?: string },
    callback: () => void,
  ): void {
    const entry: IpcLogEntry = {
      level: info.level,
      message: info.message,
      timestamp: info.timestamp ?? new Date().toISOString(),
      category: info.category,
    };

    this.buffer.push(entry);

    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }

    callback();
  }

  public close(): void {
    this.flush();

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    const entries = this.buffer;
    this.buffer = [];

    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    win.webContents.send(IPC.LOG_BATCH, entries);
  }
}
