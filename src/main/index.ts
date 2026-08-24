import { join } from 'path';
import {
  app,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  dialog,
  BrowserWindow,
  type WebContents,
} from 'electron';
import { electronApp, is } from '@electron-toolkit/utils';
import serve from 'electron-serve';
import { IPC } from '@shared/ipc/ipc-channels';
import type { IpcOutboundMap } from '@shared/ipc/ipc-channel-map';
import { buildCspString } from '@shared/security/csp-policy';
import {
  IpcBridge,
  registerAppVersionHandler,
  registerBootProgressConsumer,
  registerBootProgressSnapshotHandler,
} from './ipc';
import { startPositionBroadcaster } from './ipc/position-broadcaster';
import { registerTrustedSender, unregisterTrustedSender } from './ipc/sender-validation';
import { secureEmptyInvoke, secureEmptyListener } from './ipc/secure-handler';
import type { IpcSendFn } from './ipc/ipc-types';
import { WindowRegistry } from './window-registry';
import { SessionManager } from './session';
import { IconCacheManager } from './cache/icons';
import { MapCacheManager } from './cache/maps';
import { AmulCacheManager } from './cache/amul';
import { BootOrchestrator } from './boot';
import { startSleepPrevention, stopSleepPrevention } from './platform';
import { installEmbeddedCryptoMaterial } from './protocol/crypto-material-embedded';
import { logger, attachIpcTransport, shutdownLogger } from './logging';
import {
  APP_USER_MODEL_ID,
  computeWindowFit,
  resolveRelaunchIconPath,
  resolveWindowIcon,
} from './lib';
import { ensureConfigDir } from './app-config';
import { installArgvGate, installWebContentsGuard, installFaultListener } from './anti-re';

installArgvGate();

const iconCache = new IconCacheManager();
const mapCache = new MapCacheManager();
const amulCache = new AmulCacheManager();
const bootOrchestrator = new BootOrchestrator({ iconCache, mapCache, amulCache });
const registry = new WindowRegistry();
let bridge: IpcBridge | null = null;
let docsWindowRef: BrowserWindow | null = null;

/**
 * JumpList / pin metadata for packaged Windows — skip in dev (AUMID is electron.exe path).
 * Relaunch icon comes from the PE (`process.execPath`), not the sidecar ICO — Explorer
 * already proves those PE resources paint correctly; the taskbar running icon is set via
 * BrowserWindow `icon` separately.
 */
const wireWindowsAppDetails = (win: BrowserWindow): void => {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const relaunchIcon = resolveRelaunchIconPath();
  win.setAppDetails({
    appId: APP_USER_MODEL_ID,
    ...(relaunchIcon ? { appIconPath: relaunchIcon, appIconIndex: 0 } : {}),
    relaunchDisplayName: 'wyd',
    relaunchCommand: process.execPath,
  });
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Each relaunch opens another game window, up to the plan's slot cap.
  app.on('second-instance', () => {
    openGameWindow();
  });
}

const ALLOWED_NAV_PREFIXES = ['file://', 'app://-', 'http://localhost:', 'http://127.0.0.1:'];

const wireNavigationGuard = (wc: WebContents): void => {
  wc.on('will-navigate', (event, url) => {
    if (!ALLOWED_NAV_PREFIXES.some((p) => url.startsWith(p))) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
};

// Registers a privileged `app://` protocol serving `out/docs/` as root.
// `file://` breaks VitePress's SPA router because hydration can't map an
// absolute filesystem path back to a route. `electron-serve` must be called
// BEFORE `app.whenReady()`, so initialize at module top level.
const loadDocs = serve({ directory: join(__dirname, '../docs') });

// Registers wydicon://, wydmap://, wydaffect://, wydskill://. Must run before
// app.whenReady() — Electron requires top-level registration for `standard:true`.
IconCacheManager.registerSchemeAsPrivileged();
MapCacheManager.registerSchemeAsPrivileged();
AmulCacheManager.registerSchemeAsPrivileged();

// Last-resort crash visibility: without these, a throw inside an ipcMain
// listener (or a stray rejected promise) dies with zero log lines — exactly
// the failure shape that made the Windows char-select hang undebuggable.
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException in main process', {
    code: err.message,
    stack: err.stack,
  });
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection in main process', {
    code: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  });
});

/**
 * Opens (or focuses) the secondary window with the Script API docs built by
 * VitePress. In dev and prod, loads from `out/docs/index.html` (produced by
 * `npm run docs:build`).
 */
const DOCS_SIZE = { width: 1440, height: 960 } as const;
const DOCS_MIN_SIZE = { width: 960, height: 600 } as const;

const openDocsWindow = (): void => {
  if (docsWindowRef && !docsWindowRef.isDestroyed()) {
    docsWindowRef.focus();
    return;
  }

  const icon = resolveWindowIcon();
  const fit = computeWindowFit(screen.getPrimaryDisplay().workAreaSize, DOCS_SIZE, DOCS_MIN_SIZE);
  const win = new BrowserWindow({
    width: fit.width,
    height: fit.height,
    minWidth: DOCS_MIN_SIZE.width,
    minHeight: DOCS_MIN_SIZE.height,
    resizable: fit.clamped,
    autoHideMenuBar: true,
    title: 'wydbot.com — Script API',
    ...(icon ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  wireWindowsAppDetails(win);

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });
  wireNavigationGuard(win.webContents);

  void loadDocs(win);

  win.on('closed', () => {
    if (docsWindowRef === win) {
      docsWindowRef = null;
    }
  });

  docsWindowRef = win;
};

const SPLASH_SIZE = { width: 460, height: 260 } as const;
const GAME_VIEW_SIZE = { width: 1280, height: 960 } as const;
const GAME_VIEW_MIN_SIZE = { width: 800, height: 600 } as const;

const makeSend =
  (win: BrowserWindow): IpcSendFn =>
  <C extends keyof IpcOutboundMap>(
    channel: C,
    ...args: IpcOutboundMap[C] extends undefined ? [] : [payload: IpcOutboundMap[C]]
  ): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  };

/** Keep maximize/fullscreen off for the whole lifetime (including after splash resize). */
const wireNoMaximize = (win: BrowserWindow): void => {
  win.setMaximizable(false);
  win.setFullScreenable(false);
  win.on('maximize', () => {
    if (!win.isDestroyed()) win.unmaximize();
  });
  win.on('enter-full-screen', () => {
    if (!win.isDestroyed()) win.setFullScreen(false);
  });
};

/**
 * Ask before the user closes a game window.
 */
const wireCloseConfirm = (win: BrowserWindow): void => {
  let allowClose = false;
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    void (async () => {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Cancelar', 'Fechar'],
        defaultId: 0,
        cancelId: 0,
        title: 'Fechar WYDBot',
        message: 'Tem certeza que deseja fechar?',
        detail: 'O macro e a conexão com o jogo serão encerrados.',
        noLink: true,
      });
      if (response !== 1 || win.isDestroyed()) return;
      allowClose = true;
      win.close();
    })();
  });
};

// Builds one game-client window with its own session, outbound channel, and
// position broadcaster; registers it and wires teardown on close/crash.
const createGameWindow = (): void => {
  const icon = resolveWindowIcon();
  const win = new BrowserWindow({
    width: SPLASH_SIZE.width,
    height: SPLASH_SIZE.height,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' && { titleBarStyle: 'hidden' as const }),
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  });
  wireWindowsAppDetails(win);

  wireNoMaximize(win);
  wireCloseConfirm(win);

  win.on('ready-to-show', () => {
    if (process.platform === 'darwin') {
      win.setWindowButtonVisibility(false);
    }
    win.show();
  });

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });
  wireNavigationGuard(win.webContents);

  const session = new SessionManager();
  const send = makeSend(win);
  // Capture id BEFORE 'closed' — webContents is destroyed by the time it fires.
  const wcId = win.webContents.id;
  const stopBroadcaster = startPositionBroadcaster(session, send);
  registry.add({ windowId: wcId, win, session, send, stopBroadcaster });
  registerTrustedSender(wcId);
  registerBootProgressConsumer(win);
  // Idempotent: arms on the first window, re-arms on a macOS re-open.
  startSleepPrevention();

  const release = (): void => {
    const entry = registry.release(wcId);
    if (!entry) return;
    entry.stopBroadcaster?.();
    entry.session.cleanup();
    unregisterTrustedSender(wcId);
  };
  win.on('closed', release);
  // A dead renderer frees its slot AND is destroyed so no blank orphan lingers.
  win.webContents.on('render-process-gone', () => {
    release();
    if (!win.isDestroyed()) win.destroy();
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

const openGameWindow = (): void => {
  createGameWindow();
};

// Boot-time creation of the macro config folder. Non-fatal: an unwritable
// Documents (locked dir, OneDrive/AV) logs a warning instead of blocking boot.
const initConfigDir = async (): Promise<void> => {
  try {
    await ensureConfigDir();
  } catch (err) {
    logger.warn('Config dir init failed', {
      code: err instanceof Error ? err.message : String(err),
    });
  }
};

const bootstrap = async (): Promise<void> => {
  await app.whenReady();

  installWebContentsGuard();
  installFaultListener();

  if (process.platform === 'win32') {
    electronApp.setAppUserModelId(APP_USER_MODEL_ID);

    // Portable build has no installer → Windows toast notifications won't work
    // without a Start Menu shortcut carrying the matching AUMID.
    const shortcutPath = join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'WYD Bot.lnk',
    );
    try {
      shell.writeShortcutLink(shortcutPath, 'create', {
        target: process.execPath,
        appUserModelId: APP_USER_MODEL_ID,
        description: 'WYD Bot',
      });
    } catch {
      logger.warn('Failed to create Start Menu shortcut — notifications may not appear');
    }
  }

  // Create the per-machine config folder (~/Documents/w-<fingerprint>) up front,
  // not lazily on first save. Fire-and-forget + non-fatal: it isn't needed until
  // a macro dialog opens, and an unwritable Documents must not block boot.
  void initConfigDir();

  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

  // Clipboard-write is the only renderer permission the UI needs ("Copiar ID").
  // It may be gated via the request OR the check handler, so allow it in both.
  const isAllowed = (permission: string): boolean =>
    permission === 'clipboard-sanitized-write' || permission === 'notifications';
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isAllowed(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => isAllowed(permission));

  const cspHeader = buildCspString(is.dev ? 'development' : 'production');
  // The docs window serves a local, trusted VitePress SPA over app://, which
  // bootstraps its router via inline scripts; relax script-src to 'unsafe-inline'
  // for app:// only, keeping the game renderer (file://) on the strict policy.
  const docsCspHeader = buildCspString('docs');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDocs = details.url.startsWith('app://');
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDocs ? docsCspHeader : cspHeader],
      },
    });
  });

  attachIpcTransport(() => registry.focusedWindow());
  ipcMain.handle(
    IPC.DOCS_OPEN,
    secureEmptyInvoke(() => {
      openDocsWindow();
    }),
  );

  iconCache.registerProtocol();
  mapCache.registerProtocol();
  amulCache.registerProtocol();

  registerAppVersionHandler();
  registerBootProgressSnapshotHandler();

  installEmbeddedCryptoMaterial();
  bridge = new IpcBridge(registry, iconCache);
  bridge.register();

  ipcMain.on(
    IPC.SPLASH_DONE,
    secureEmptyListener((event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      // setSize counts the frame, so its overhead is discounted from the work area.
      const workArea = screen.getDisplayMatching(win.getBounds()).workAreaSize;
      const [outerW, outerH] = win.getSize();
      const [contentW, contentH] = win.getContentSize();
      const fit = computeWindowFit(
        {
          width: workArea.width - (outerW - contentW),
          height: workArea.height - (outerH - contentH),
        },
        GAME_VIEW_SIZE,
        GAME_VIEW_MIN_SIZE,
      );
      win.setResizable(true);
      win.setMaximizable(false);
      win.setFullScreenable(false);
      win.setMinimumSize(GAME_VIEW_MIN_SIZE.width, GAME_VIEW_MIN_SIZE.height);
      win.setSize(fit.width, fit.height);
      win.setResizable(fit.clamped);
      win.center();
      if (process.platform === 'darwin') {
        win.setWindowButtonVisibility(true);
      }
    }),
  );

  openGameWindow();

  ipcMain.on(
    IPC.BOOT_RETRY,
    secureEmptyListener(() => {
      bootOrchestrator.retry();
    }),
  );

  // Proceed past a validation error on the current store; the degraded DB drives the in-game banner.
  ipcMain.on(
    IPC.BOOT_CONTINUE_DEGRADED,
    secureEmptyListener(() => {
      bootOrchestrator.continueDegraded();
    }),
  );

  void bootOrchestrator.start();

  app.on('activate', () => {
    if (registry.size === 0) {
      openGameWindow();
    }
  });
};

void bootstrap();

app.on('window-all-closed', () => {
  stopSleepPrevention();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const teardown = (): void => {
  bridge?.cleanup();
  shutdownLogger();
};

app.on('before-quit', () => {
  teardown();
});
