import { app, BrowserWindow, ipcMain, type WebContents } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import { RuntimeFaultPayloadSchema } from '@shared/ipc/schemas';
import { secureListener } from '../ipc/secure-handler';
import { triggerFakeCrash, DetectionVector } from './fake-crash';
import type { DetectionVectorCode } from './types';

const BLOCKED_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address',
  'enable-logging',
  'no-sandbox',
  'enable-automation',
  'headless',
] as const;

const BLOCKED_ENV = [
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
  'ELECTRON_ENABLE_LOGGING',
  'ELECTRON_ENABLE_STACK_DUMPING',
] as const;

// Must be called before app.whenReady() — Chromium reads these switches
// during browser-process init.
export const installArgvGate = (): void => {
  if (!app.isPackaged) return;

  for (const sw of BLOCKED_SWITCHES) {
    if (app.commandLine.hasSwitch(sw)) {
      triggerFakeCrash(DetectionVector.ARGV_GATE);
      return;
    }
  }

  for (const sw of BLOCKED_SWITCHES) {
    app.commandLine.removeSwitch(sw);
  }

  for (const env of BLOCKED_ENV) {
    delete process.env[env];
  }
};

// Grace before reacting to a debugger detach: on a legitimate window close the
// native agent host dies BEFORE the JS `isDestroyed()` flag flips, so an
// immediate check false-positives. Deferring lets the teardown settle — a dead
// target means the detach was benign; a live one means an attacker detached
// our self-attach. `reason` cannot discriminate (Electron emits "target
// closed" for both paths).
const DETACH_GRACE_MS = 100;

let appQuitting = false;

export const setGuardQuittingForTests = (value: boolean): void => {
  appQuitting = value;
};

const handleDebuggerDetach = (wc: WebContents): void => {
  setTimeout(() => {
    if (appQuitting || wc.isDestroyed()) return;
    const win = BrowserWindow.fromWebContents(wc);
    if (!win || win.isDestroyed()) return;
    triggerFakeCrash(DetectionVector.DEBUGGER_DETACH);
  }, DETACH_GRACE_MS);
};

const armDebuggerSelfAttach = (wc: WebContents): void => {
  if (wc.isDestroyed()) return;

  try {
    wc.debugger.attach('1.3');
  } catch {
    triggerFakeCrash(DetectionVector.DEBUGGER_DETACH);
    return;
  }

  wc.debugger.on('message', async (_event, method: string) => {
    if (method !== 'Debugger.paused') return;
    try {
      await wc.debugger.sendCommand('Debugger.resume');
    } catch {
      if (!wc.isDestroyed()) {
        try {
          wc.debugger.detach();
        } catch {
          // detached
        }
      }
    }
  });

  wc.debugger.on('detach', () => handleDebuggerDetach(wc));
};

const isDevToolsShortcut = (input: Electron.Input): boolean => {
  if (input.type !== 'keyDown') return false;
  const { code, control, meta, shift, alt } = input;
  if (code === 'F12') return true;
  if (shift && control && (code === 'KeyI' || code === 'KeyJ' || code === 'KeyC')) return true;
  if (alt && meta && code === 'KeyI') return true;
  return false;
};

const isReloadShortcut = (input: Electron.Input): boolean => {
  if (input.type !== 'keyDown') return false;
  return input.code === 'KeyR' && (input.control || input.meta);
};

const wireInputGuard = (wc: WebContents): void => {
  wc.on('before-input-event', (_event, input) => {
    if (!app.isPackaged) return;
    if (isDevToolsShortcut(input) || isReloadShortcut(input)) {
      _event.preventDefault();
    }
  });
};

export const armWebContents = (wc: WebContents): void => {
  armDebuggerSelfAttach(wc);
  wc.on('devtools-opened', () => {
    triggerFakeCrash(DetectionVector.DEVTOOLS_OPENED);
  });
  wireInputGuard(wc);
};

// Registered from installWebContentsGuard (inside bootstrap, after
// app.whenReady) so it always runs AFTER quit-preventing `before-quit`
// handlers registered at module evaluation (the asar-swap flush in
// index.ts). A prevented quit leaves the app alive, so the flag must stay
// false — setting it on a prevented quit would disarm detach detection
// while the app keeps running.
export const registerQuittingFlag = (): void => {
  app.on('before-quit', (event) => {
    if (!event.defaultPrevented) appQuitting = true;
  });
};

// `__PROD__` is a build-time constant (see build-constants.d.ts): in the
// shipped bundle `if (!true)` is dead-code-eliminated and the guard always
// arms — there is no runtime switch to flip. In dev it stays false so
// DevTools/F12/reload work for debugging.
export const installWebContentsGuard = (): void => {
  if (!__PROD__) return;
  registerQuittingFlag();
  app.on('web-contents-created', (_event, wc) => {
    armWebContents(wc);
  });
};

const FAULT_VECTOR_BY_PAYLOAD: Readonly<Record<number, DetectionVectorCode>> = {
  1: DetectionVector.CONSOLE_TRAP,
  2: DetectionVector.TIMING_TRAP,
  3: DetectionVector.AGENT_AUTOMATION,
};

export const handleRuntimeFault = (payload: number): void => {
  triggerFakeCrash(FAULT_VECTOR_BY_PAYLOAD[payload] ?? DetectionVector.AGENT_AUTOMATION);
};

export const installFaultListener = (): void => {
  if (!__PROD__) return;
  ipcMain.on(
    IPC.RUNTIME_FAULT,
    secureListener(
      RuntimeFaultPayloadSchema,
      (_event, payload) => {
        handleRuntimeFault(payload);
      },
      IPC.RUNTIME_FAULT,
    ),
  );
};
