import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock @main/logging so the guard module doesn't pull in winston at import.
vi.mock('@main/logging', () => ({
  ipcLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Capture handlers registered via app.on / ipcMain.on for direct invocation.
let capturedWcHandler: ((event: unknown, wc: unknown) => void) | undefined;
let capturedIpcHandler: ((event: unknown, raw: unknown) => void) | undefined;
const capturedBeforeQuitHandlers: Array<(event: { defaultPrevented: boolean }) => void> = [];

const mockRemoveSwitch = vi.fn();
const mockHasSwitch = vi.fn((_sw: string) => false);
const mockAttach = vi.fn();
const mockSendCommand = vi.fn().mockResolvedValue(undefined);
const mockDebuggerOn = vi.fn();
const mockWcOn = vi.fn();
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockFromWebContents = vi.fn();

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    commandLine: {
      hasSwitch: (sw: string) => mockHasSwitch(sw),
      removeSwitch: (sw: string) => mockRemoveSwitch(sw),
    },
    once: vi.fn(),
    on: vi.fn((event: string, handler: unknown) => {
      if (event === 'web-contents-created') {
        capturedWcHandler = handler as typeof capturedWcHandler;
      }
      if (event === 'before-quit') {
        capturedBeforeQuitHandlers.push(handler as (typeof capturedBeforeQuitHandlers)[number]);
      }
    }),
  },
  BrowserWindow: {
    fromWebContents: (wc: unknown) => mockFromWebContents(wc),
  },
  ipcMain: {
    on: vi.fn((_channel: string, handler: unknown) => {
      capturedIpcHandler = handler as typeof capturedIpcHandler;
    }),
  },
}));

vi.mock('@shared/ipc/ipc-channels', () => ({
  IPC: { RUNTIME_FAULT: 'wyd:runtime-fault' },
}));

vi.mock('@shared/ipc/schemas', () => ({
  RuntimeFaultPayloadSchema: {
    safeParse: (v: unknown) => ({ success: true, data: v }),
  },
}));

vi.mock('@main/ipc/secure-handler', () => ({
  secureListener: vi.fn((_schema: unknown, handler: (e: unknown, p: unknown) => void) => handler),
}));

const mockTriggerFakeCrash = vi.fn();
vi.mock('@main/anti-re/fake-crash', () => ({
  triggerFakeCrash: (...a: unknown[]) => mockTriggerFakeCrash(...a),
  DetectionVector: {
    ARGV_GATE: 1,
    DEBUGGER_DETACH: 2,
    DEVTOOLS_OPENED: 3,
    CONSOLE_TRAP: 4,
    TIMING_TRAP: 5,
    AGENT_AUTOMATION: 6,
  },
}));

import {
  installArgvGate,
  installWebContentsGuard,
  installFaultListener,
  armWebContents,
  handleRuntimeFault,
  registerQuittingFlag,
  setGuardQuittingForTests,
} from '@main/anti-re/devtools-guard';

const makeMockWc = () => ({
  isDestroyed: mockIsDestroyed,
  debugger: {
    attach: mockAttach,
    on: mockDebuggerOn,
    sendCommand: mockSendCommand,
  },
  on: mockWcOn,
});

const getDetachHandler = (): (() => void) => {
  const call = mockDebuggerOn.mock.calls.find(([event]) => event === 'detach');
  expect(call).toBeDefined();
  return call![1] as () => void;
};

describe('installArgvGate', () => {
  afterEach(() => vi.clearAllMocks());

  it('triggers a fake crash when a blocked switch is present', () => {
    mockHasSwitch.mockImplementation((sw: string) => sw === 'remote-debugging-port');
    installArgvGate();
    expect(mockTriggerFakeCrash).toHaveBeenCalledTimes(1);
  });

  it('removes all blocked switches when none are present', () => {
    mockHasSwitch.mockReturnValue(false);
    installArgvGate();
    expect(mockTriggerFakeCrash).not.toHaveBeenCalled();
    expect(mockRemoveSwitch).toHaveBeenCalledWith('remote-debugging-port');
    expect(mockRemoveSwitch).toHaveBeenCalledWith('no-sandbox');
  });

  it('scrubs ELECTRON_RUN_AS_NODE from the environment', () => {
    mockHasSwitch.mockReturnValue(false);
    process.env.ELECTRON_RUN_AS_NODE = '1';
    installArgvGate();
    expect(process.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it('triggers fake crash when --enable-automation is present', () => {
    mockHasSwitch.mockImplementation((sw: string) => sw === 'enable-automation');
    installArgvGate();
    expect(mockTriggerFakeCrash).toHaveBeenCalledTimes(1);
  });

  it('triggers fake crash when --headless is present', () => {
    mockHasSwitch.mockImplementation((sw: string) => sw === 'headless');
    installArgvGate();
    expect(mockTriggerFakeCrash).toHaveBeenCalledTimes(1);
  });

  it('removes enable-automation and headless when none are present', () => {
    mockHasSwitch.mockReturnValue(false);
    installArgvGate();
    expect(mockRemoveSwitch).toHaveBeenCalledWith('enable-automation');
    expect(mockRemoveSwitch).toHaveBeenCalledWith('headless');
  });
});

// vitest defines `__PROD__: 'false'` (dev semantics) — the installers must
// no-op, which is exactly the dev-mode DevTools freedom this gate exists for.
describe('__PROD__ gate (dev mode)', () => {
  afterEach(() => {
    capturedWcHandler = undefined;
    capturedIpcHandler = undefined;
    vi.clearAllMocks();
  });

  it('installWebContentsGuard does not register web-contents-created', () => {
    installWebContentsGuard();
    expect(capturedWcHandler).toBeUndefined();
  });

  it('installFaultListener does not register RUNTIME_FAULT', () => {
    installFaultListener();
    expect(capturedIpcHandler).toBeUndefined();
  });
});

describe('handleRuntimeFault', () => {
  afterEach(() => vi.clearAllMocks());

  it('maps payload 1 to CONSOLE_TRAP', () => {
    handleRuntimeFault(1);
    expect(mockTriggerFakeCrash).toHaveBeenCalledWith(4);
  });

  it('maps payload 2 to TIMING_TRAP', () => {
    handleRuntimeFault(2);
    expect(mockTriggerFakeCrash).toHaveBeenCalledWith(5);
  });

  it('maps payload 3 to AGENT_AUTOMATION', () => {
    handleRuntimeFault(3);
    expect(mockTriggerFakeCrash).toHaveBeenCalledWith(6);
  });

  it('maps unknown payloads to AGENT_AUTOMATION', () => {
    handleRuntimeFault(99);
    expect(mockTriggerFakeCrash).toHaveBeenCalledWith(6);
  });
});

describe('armWebContents', () => {
  afterEach(() => vi.clearAllMocks());

  it('self-attaches debugger and wires hooks on a new webContents', () => {
    armWebContents(makeMockWc() as never);

    expect(mockAttach).toHaveBeenCalledWith('1.3');
    expect(mockDebuggerOn).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockDebuggerOn).toHaveBeenCalledWith('detach', expect.any(Function));
    expect(mockWcOn).toHaveBeenCalledWith('devtools-opened', expect.any(Function));
    expect(mockWcOn).toHaveBeenCalledWith('before-input-event', expect.any(Function));
  });

  it('triggers fake crash if debugger attach fails (already attached)', () => {
    mockAttach.mockImplementationOnce(() => {
      throw new Error('Another debugger is already attached');
    });

    armWebContents(makeMockWc() as never);

    expect(mockTriggerFakeCrash).toHaveBeenCalledTimes(1);
  });

  it('does not crash when webContents is already destroyed', () => {
    mockIsDestroyed.mockReturnValueOnce(true);
    mockAttach.mockClear();

    armWebContents(makeMockWc() as never);

    expect(mockAttach).not.toHaveBeenCalled();
  });
});

describe('debugger detach grace', () => {
  beforeEach(() => {
    mockIsDestroyed.mockReturnValue(false);
    mockFromWebContents.mockReturnValue({ isDestroyed: () => false });
  });

  afterEach(() => {
    vi.useRealTimers();
    setGuardQuittingForTests(false);
    vi.clearAllMocks();
  });

  const armAndDetach = (): void => {
    armWebContents(makeMockWc() as never);
    getDetachHandler()();
  };

  it('faults when the target is still alive after the grace (attacker detach)', () => {
    vi.useFakeTimers();
    armAndDetach();
    vi.advanceTimersByTime(150);
    expect(mockTriggerFakeCrash).toHaveBeenCalledWith(2);
  });

  it('does not fault when the webContents was destroyed (legit window close)', () => {
    vi.useFakeTimers();
    // Arm while alive; the target dies between detach and the grace re-check.
    armWebContents(makeMockWc() as never);
    mockIsDestroyed.mockReturnValue(true);
    getDetachHandler()();
    vi.advanceTimersByTime(150);
    expect(mockTriggerFakeCrash).not.toHaveBeenCalled();
  });

  it('does not fault when the BrowserWindow is gone (legit window close)', () => {
    vi.useFakeTimers();
    armAndDetach();
    mockFromWebContents.mockReturnValue(null);
    vi.advanceTimersByTime(150);
    expect(mockTriggerFakeCrash).not.toHaveBeenCalled();
  });

  it('does not fault when the BrowserWindow was destroyed', () => {
    vi.useFakeTimers();
    armAndDetach();
    mockFromWebContents.mockReturnValue({ isDestroyed: () => true });
    vi.advanceTimersByTime(150);
    expect(mockTriggerFakeCrash).not.toHaveBeenCalled();
  });

  it('does not fault while the app is quitting', () => {
    vi.useFakeTimers();
    setGuardQuittingForTests(true);
    armAndDetach();
    vi.advanceTimersByTime(150);
    expect(mockTriggerFakeCrash).not.toHaveBeenCalled();
  });
});

describe('registerQuittingFlag', () => {
  beforeEach(() => {
    mockIsDestroyed.mockReturnValue(false);
    mockFromWebContents.mockReturnValue({ isDestroyed: () => false });
  });

  afterEach(() => {
    vi.useRealTimers();
    setGuardQuittingForTests(false);
    capturedBeforeQuitHandlers.length = 0;
    vi.clearAllMocks();
  });

  const armDetachAndQuit = (defaultPrevented: boolean): void => {
    registerQuittingFlag();
    armWebContents(makeMockWc() as never);
    getDetachHandler()();
    for (const handler of capturedBeforeQuitHandlers) {
      handler({ defaultPrevented });
    }
  };

  it('suppresses detach fault once a real quit begins', () => {
    vi.useFakeTimers();
    armDetachAndQuit(false);
    vi.advanceTimersByTime(150);
    expect(mockTriggerFakeCrash).not.toHaveBeenCalled();
  });

  it('keeps detach detection when the quit was prevented (app stays alive)', () => {
    vi.useFakeTimers();
    armDetachAndQuit(true);
    vi.advanceTimersByTime(150);
    expect(mockTriggerFakeCrash).toHaveBeenCalledWith(2);
  });
});
