import { join } from 'path';
import { app } from 'electron';
import { is } from '@electron-toolkit/utils';
import { createLogger, format, transports, type Logger } from 'winston';
import type { BrowserWindow } from 'electron';
import DailyRotateFile from 'winston-daily-rotate-file';
import { IpcLogTransport } from './ipc-log-transport';

// Dev: repo `logs/` next to package root (bundle lives in out/main → ../../logs).
// Same rationale as getResourcePath — don't trust app.getAppPath() in dev.
const logDir = is.dev ? join(__dirname, '..', '..', 'logs') : join(app.getPath('userData'), 'logs');

const consoleFormat = format.combine(
  format.timestamp({ format: 'HH:mm:ss.SSS' }),
  format.colorize(),
  format.printf(({ timestamp, level, message, category }) => {
    const label = category ? ` [${category}]` : '';
    return `${timestamp} ${level}${label}: ${message}`;
  }),
);

const fileFormat = format.combine(format.timestamp(), format.json());

const coreTransports: (DailyRotateFile | InstanceType<typeof transports.Console>)[] = [];

// DailyRotateFile mkdir's `logDir` synchronously in its constructor and rethrows
// on any non-EEXIST error. Since this runs at module load (before app.whenReady),
// an unwritable userData (locked dir, OneDrive redirect, AV) would abort boot
// with zero logs. Guard it so logging can never be the thing that stops the app.
try {
  coreTransports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: 'wyd-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true,
      format: fileFormat,
    }),
  );
} catch (err) {
  console.error('[logger] file transport init failed; falling back to console-only:', err);
}

// Console transport is always on. In dev it's the colorized live view; in
// production it's the fallback sink that surfaces boot crashes to stdout —
// captured by `ELECTRON_ENABLE_LOGGING=1` (e.g. the CI launch smoke test).
coreTransports.push(new transports.Console({ format: consoleFormat }));

export const logger: Logger = createLogger({
  level: is.dev ? 'debug' : 'info',
  transports: coreTransports,
});

const createChild = (category: string): Logger => logger.child({ category });

export const protocolLogger = createChild('protocol');
export const sessionLogger = createChild('session');
export const ipcLogger = createChild('ipc');
export const platformLogger = createChild('platform');
export const assetsLogger = createChild('assets');
export const appLogger = createChild('app');
export const authLogger = createChild('auth');

export const attachIpcTransport = (getWindow: () => BrowserWindow | null): void => {
  logger.add(new IpcLogTransport(getWindow));
};

export const shutdownLogger = (): void => {
  logger.close();
};
