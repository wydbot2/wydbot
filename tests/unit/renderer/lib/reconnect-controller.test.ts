/**
 * Reconnect controller: close-budget, connect/handshake timeouts, bag SoT.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyReconnectBag,
  isBagArmed,
  RECONNECT_CONNECT_TIMEOUT_MS,
  RECONNECT_FAIL,
  RECONNECT_HANDSHAKE_TIMEOUT_MS,
  type ReconnectBag,
} from '../../../../src/renderer/lib/reconnect-helpers';

const { connect, disconnect, selectCharacter, stopMacro, startMacro, sendRendererLog } = vi.hoisted(
  () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    selectCharacter: vi.fn(),
    stopMacro: vi.fn(),
    startMacro: vi.fn(),
    sendRendererLog: vi.fn(),
  }),
);

const channel = { name: 'Ch1', ip: '1.2.3.4', port: 8281 };

const makeBag = (over: Partial<ReconnectBag> = {}): ReconnectBag => ({
  ...emptyReconnectBag(),
  channel,
  username: 'hero',
  password: 'secret',
  token: '1234',
  charIndex: 0,
  ...over,
});

const reconnectState = vi.hoisted(() => {
  const bag: ReconnectBag = {
    channel: { name: 'Ch1', ip: '1.2.3.4', port: 8281 },
    username: 'hero',
    password: 'secret',
    token: '1234',
    hardwareIdentitySeed: null,
    proxyListUrl: null,
    charIndex: 0,
  };
  return {
    bagKey: 'device-key',
    bags: { 'device-key': bag } as Record<string, ReconnectBag>,
    enabled: true,
    phase: 'armed' as string,
    attempt: 0,
    maxAttempts: 5,
    nextRetryAt: null as number | null,
    lastError: null as string | null,
    macroShouldRestart: false,
    suppressReconnect: false,
    setPhase: vi.fn((p: string) => {
      reconnectState.phase = p;
    }),
    setAttempt: vi.fn((n: number) => {
      reconnectState.attempt = n;
    }),
    setNextRetryAt: vi.fn((v: number | null) => {
      reconnectState.nextRetryAt = v;
    }),
    setLastError: vi.fn((e: string | null) => {
      reconnectState.lastError = e;
    }),
    setMacroShouldRestart: vi.fn((v: boolean) => {
      reconnectState.macroShouldRestart = v;
    }),
    setSuppressReconnect: vi.fn((v: boolean) => {
      reconnectState.suppressReconnect = v;
    }),
    getActiveBag: () =>
      reconnectState.bagKey ? (reconnectState.bags[reconnectState.bagKey] ?? null) : null,
  };
});

const authState = vi.hoisted(() => ({
  username: '',
  password: '',
  token: '',
  hardwareIdentitySeed: null as string | null,
  proxyListUrl: null as string | null,
  setCredentials: vi.fn((u: string, p: string) => {
    authState.username = u;
    authState.password = p;
  }),
  setToken: vi.fn((t: string) => {
    authState.token = t;
  }),
  setHardwareIdentitySeed: vi.fn((seed: string | null) => {
    authState.hardwareIdentitySeed = seed;
  }),
  setProxyListUrl: vi.fn((url: string | null) => {
    authState.proxyListUrl = url;
  }),
  reset: vi.fn(() => {
    authState.username = '';
    authState.password = '';
    authState.token = '';
    authState.hardwareIdentitySeed = null;
    authState.proxyListUrl = null;
  }),
  clearSecrets: vi.fn(),
}));

const connectionState = vi.hoisted(() => ({
  selectChannel: vi.fn(),
  setStatus: vi.fn(),
}));

const uiState = vi.hoisted(() => ({
  setScreen: vi.fn(),
  setLoading: vi.fn(),
}));

const macroLife = vi.hoisted(() => ({
  status: 'idle' as string,
}));

vi.mock('../../../../src/renderer/lib/game-api', () => ({
  gameApi: { connect, disconnect, selectCharacter },
}));
vi.mock('../../../../src/renderer/lib/macro-engine', () => ({
  stopMacro,
  startMacro,
}));
vi.mock('../../../../src/renderer/lib/electron-api', () => ({
  getWydAPI: () => ({ sendRendererLog }),
}));
vi.mock('../../../../src/renderer/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../src/renderer/stores/reconnect-store', () => ({
  useReconnectStore: { getState: () => reconnectState },
}));
vi.mock('../../../../src/renderer/stores/auth-store', () => ({
  useAuthStore: { getState: () => authState },
}));
vi.mock('../../../../src/renderer/stores/connection-store', () => ({
  useConnectionStore: { getState: () => connectionState },
}));
vi.mock('../../../../src/renderer/stores/ui-store', () => ({
  useUIStore: { getState: () => uiState },
}));
vi.mock('../../../../src/renderer/stores/macro-lifecycle-store', () => ({
  useMacroLifecycleStore: { getState: () => macroLife },
}));
vi.mock('../../../../src/renderer/stores/macro-status', () => ({
  MacroStatus: { Idle: 'idle', Running: 'running', Paused: 'paused' },
}));

import {
  cancelReconnect,
  isReconnectOwned,
  isReconnectSuppressingDisconnect,
  onCharToWorldDuringReconnect,
  onLoginFailedDuringReconnect,
  onReconnectConnectionError,
  onReconnectSocketConnected,
  onTokenAcceptedDuringReconnect,
  onUnexpectedDisconnect,
  shouldHandleDisconnect,
} from '../../../../src/renderer/lib/reconnect-controller';

/** Advance past first-attempt backoff (2s) + cleanup sleep (50ms). */
const runFirstAttempt = async (): Promise<void> => {
  onUnexpectedDisconnect();
  await vi.advanceTimersByTimeAsync(2000);
  await vi.advanceTimersByTimeAsync(50);
};

describe('reconnect-controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    cancelReconnect();
    reconnectState.enabled = true;
    reconnectState.bagKey = 'device-key';
    reconnectState.bags['device-key'] = makeBag();
    reconnectState.phase = 'armed';
    reconnectState.attempt = 0;
    reconnectState.maxAttempts = 5;
    reconnectState.lastError = null;
    reconnectState.suppressReconnect = false;
    reconnectState.macroShouldRestart = false;
    macroLife.status = 'idle';
    authState.username = '';
    authState.password = '';
    authState.token = '';
  });

  afterEach(() => {
    cancelReconnect();
    vi.useRealTimers();
  });

  it('shouldHandleDisconnect when bag armed', () => {
    expect(isBagArmed(reconnectState.getActiveBag())).toBe(true);
    expect(shouldHandleDisconnect()).toBe(true);
  });

  it('on unexpected disconnect schedules attempt without wiping bag', () => {
    onUnexpectedDisconnect();
    expect(isReconnectOwned()).toBe(true);
    expect(reconnectState.attempt).toBe(1);
    expect(uiState.setScreen).toHaveBeenCalledWith('reconnecting');
    expect(reconnectState.bags['device-key'].password).toBe('secret');
    expect(reconnectState.bags['device-key'].token).toBe('1234');
  });

  it('T1: cleanup disconnect with close budget does not burn attempts', async () => {
    await runFirstAttempt();
    expect(disconnect).toHaveBeenCalled();
    expect(isReconnectSuppressingDisconnect()).toBe(true);

    const attemptBefore = reconnectState.attempt;
    onUnexpectedDisconnect(); // DISCONNECT IPC noise
    onUnexpectedDisconnect(); // residual close
    expect(reconnectState.attempt).toBe(attemptBefore);
    expect(reconnectState.lastError).toBeNull();
  });

  it('runAttempt connects and keeps bag as credential source', async () => {
    await runFirstAttempt();

    const bag = reconnectState.getActiveBag();
    expect(connect).toHaveBeenCalledWith(bag?.channel, null);
    expect(authState.setCredentials).toHaveBeenCalledWith('hero', 'secret');
    authState.reset();
    expect(authState.password).toBe('');
    expect(reconnectState.getActiveBag()?.password).toBe('secret');
  });

  it('socket connected clears budget so mid-pipeline drop counts as failure', async () => {
    await runFirstAttempt();
    onReconnectSocketConnected();
    expect(isReconnectSuppressingDisconnect()).toBe(false);

    onUnexpectedDisconnect();
    expect(reconnectState.lastError).toBe(RECONNECT_FAIL.MID_PIPELINE);
    expect(reconnectState.attempt).toBe(2);
  });

  it('T2: connect timeout fails attempt when never connected', async () => {
    await runFirstAttempt();
    expect(connect).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RECONNECT_CONNECT_TIMEOUT_MS);
    expect(reconnectState.lastError).toBe(RECONNECT_FAIL.CONNECT_TIMEOUT);
    // Next attempt scheduled
    expect(reconnectState.attempt).toBe(2);
    expect(reconnectState.phase).toBe('waiting-backoff');
  });

  it('T3: handshake timeout + residual disconnect burns only one attempt step', async () => {
    await runFirstAttempt();
    onReconnectSocketConnected();
    const attemptAtConnected = reconnectState.attempt;

    await vi.advanceTimersByTimeAsync(RECONNECT_HANDSHAKE_TIMEOUT_MS);
    expect(reconnectState.lastError).toBe(RECONNECT_FAIL.HANDSHAKE_TIMEOUT);
    const afterTimeout = reconnectState.attempt;
    expect(afterTimeout).toBe(attemptAtConnected + 1);

    // Synthetic residual disconnected (what main would send after timeout disconnect)
    onUnexpectedDisconnect();
    // Still same attempt number (not double-bumped)
    expect(reconnectState.attempt).toBe(afterTimeout);
  });

  it('T4: disconnect during waiting-backoff does not burn attempt', async () => {
    await runFirstAttempt();
    onReconnectSocketConnected();
    onUnexpectedDisconnect(); // fail → schedule attempt 2 with backoff
    expect(reconnectState.phase).toBe('waiting-backoff');
    const attemptDuringBackoff = reconnectState.attempt;

    onUnexpectedDisconnect();
    onReconnectConnectionError();
    expect(reconnectState.attempt).toBe(attemptDuringBackoff);
  });

  it('token OK selects char from bag', () => {
    onUnexpectedDisconnect();
    onTokenAcceptedDuringReconnect();
    expect(selectCharacter).toHaveBeenCalledWith(0);
  });

  it('CharToWorld clears ownership and can restart macro', () => {
    onUnexpectedDisconnect();
    reconnectState.macroShouldRestart = true;
    onCharToWorldDuringReconnect();
    expect(isReconnectOwned()).toBe(false);
    expect(reconnectState.phase).toBe('armed');
    expect(reconnectState.attempt).toBe(0);
    expect(startMacro).toHaveBeenCalledWith(0);
  });

  it('exhausts attempts into failed phase', () => {
    onUnexpectedDisconnect(); // attempt 1
    for (let i = 0; i < 5; i++) {
      onLoginFailedDuringReconnect(RECONNECT_FAIL.MID_PIPELINE);
    }
    expect(reconnectState.phase).toBe('failed');
    expect(uiState.setScreen).toHaveBeenCalledWith('reconnect-failed');
  });

  it('disconnect in phase=failed is ignored', () => {
    onUnexpectedDisconnect();
    for (let i = 0; i < 5; i++) {
      onLoginFailedDuringReconnect(RECONNECT_FAIL.MID_PIPELINE);
    }
    expect(reconnectState.phase).toBe('failed');
    uiState.setScreen.mockClear();
    onUnexpectedDisconnect();
    expect(uiState.setScreen).not.toHaveBeenCalledWith('login');
  });
});
