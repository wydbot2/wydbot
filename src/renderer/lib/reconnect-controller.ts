import { useAuthStore } from '../stores/auth-store';
import { useConnectionStore } from '../stores/connection-store';
import { useMacroLifecycleStore } from '../stores/macro-lifecycle-store';
import { MacroStatus } from '../stores/macro-status';
import { useReconnectStore } from '../stores/reconnect-store';
import { useUIStore } from '../stores/ui-store';
import { getWydAPI } from './electron-api';
import { gameApi } from './game-api';
import { logger } from './logger';
import { startMacro, stopMacro } from './macro-engine';
import {
  isBagArmed,
  RECONNECT_CLOSE_BUDGET,
  RECONNECT_CONNECT_TIMEOUT_MS,
  RECONNECT_FAIL,
  RECONNECT_HANDSHAKE_TIMEOUT_MS,
  reconnectBackoffMs,
} from './reconnect-helpers';

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;
let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
let owned = false;
let generation = 0;
/** Expected self-induced close/error events still to ignore. */
let closeBudget = 0;

const reconnectLog = (level: 'info' | 'warn' | 'error', message: string): void => {
  if (level === 'warn') logger.warn(`[RECONNECT] ${message}`);
  else if (level === 'error') logger.error(`[RECONNECT] ${message}`);
  else logger.log(`[RECONNECT] ${message}`);

  getWydAPI()?.sendRendererLog?.({
    level,
    message: `[RECONNECT] ${message}`,
    timestamp: new Date().toISOString(),
    category: 'reconnect',
  });
};

const clearRetryTimer = (): void => {
  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
};

const clearConnectTimer = (): void => {
  if (connectTimer != null) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
};

const clearHandshakeTimer = (): void => {
  if (handshakeTimer != null) {
    clearTimeout(handshakeTimer);
    handshakeTimer = null;
  }
};

const clearAllTimers = (): void => {
  clearRetryTimer();
  clearConnectTimer();
  clearHandshakeTimer();
};

const grantCloseBudget = (n = RECONNECT_CLOSE_BUDGET): void => {
  closeBudget = Math.max(closeBudget, n);
};

const consumeCloseBudget = (): boolean => {
  if (closeBudget <= 0) return false;
  closeBudget -= 1;
  reconnectLog('info', `ignoring expected close/error (budget left=${closeBudget})`);
  return true;
};

export const isReconnectOwned = (): boolean => owned;

/** Bridge helper: expected tear-down, backoff, or terminal failed phase. */
export const isReconnectSuppressingDisconnect = (): boolean => {
  const phase = useReconnectStore.getState().phase;
  if (phase === 'failed' || phase === 'waiting-backoff') return true;
  return owned && closeBudget > 0;
};

export const shouldHandleDisconnect = (): boolean => {
  const s = useReconnectStore.getState();
  if (s.suppressReconnect) return false;
  if (!s.enabled || !s.bagKey) return false;
  if (!isBagArmed(s.getActiveBag())) return false;
  if (s.phase === 'failed') return false;
  return true;
};

export const reconnectSkipReason = (): string | null => {
  const s = useReconnectStore.getState();
  if (s.suppressReconnect) return 'suppressReconnect=true (logout/halt intencional)';
  if (!s.enabled) return 'reconnect desligado no Misc';
  if (!s.bagKey) return 'bagKey ausente (device token)';
  if (!isBagArmed(s.getActiveBag())) return 'bag incompleto (canal/user/senha/slot)';
  if (s.phase === 'failed') return 'phase=failed (esgotou tentativas)';
  return null;
};

export const markSuppressReconnect = (): void => {
  useReconnectStore.getState().setSuppressReconnect(true);
  cancelReconnect();
};

export const cancelReconnect = (reason?: string): void => {
  generation += 1;
  clearAllTimers();
  owned = false;
  closeBudget = 0;
  useReconnectStore.getState().setNextRetryAt(null);
  if (reason) {
    reconnectLog('info', `cancelled: ${reason}`);
  }
};

export const onReconnectSocketConnected = (): void => {
  if (!owned) return;
  clearConnectTimer();
  closeBudget = 0;
  armHandshakeTimeout(generation);
  reconnectLog('info', 'socket connected — handshake timer armed');
};

export const onReconnectProxyConnected = (): void => {
  if (!owned) return;
  armConnectTimeout(generation);
};

const armConnectTimeout = (gen: number): void => {
  clearConnectTimer();
  connectTimer = setTimeout(() => {
    connectTimer = null;
    if (gen !== generation || !owned) return;
    reconnectLog('warn', `connect timeout after ${RECONNECT_CONNECT_TIMEOUT_MS}ms`);
    grantCloseBudget();
    try {
      gameApi.disconnect();
    } catch {
      // ignore
    }
    onLoginFailedDuringReconnect(RECONNECT_FAIL.CONNECT_TIMEOUT);
  }, RECONNECT_CONNECT_TIMEOUT_MS);
};

const armHandshakeTimeout = (gen: number): void => {
  clearHandshakeTimer();
  handshakeTimer = setTimeout(() => {
    handshakeTimer = null;
    if (gen !== generation || !owned) return;
    reconnectLog('warn', `handshake timeout after ${RECONNECT_HANDSHAKE_TIMEOUT_MS}ms`);
    grantCloseBudget();
    try {
      gameApi.disconnect();
    } catch {
      // ignore
    }
    onLoginFailedDuringReconnect(RECONNECT_FAIL.HANDSHAKE_TIMEOUT);
  }, RECONNECT_HANDSHAKE_TIMEOUT_MS);
};

export const onUnexpectedDisconnect = (): void => {
  const phase = useReconnectStore.getState().phase;

  if (phase === 'failed') {
    reconnectLog('info', 'ignoring disconnect in phase=failed');
    return;
  }

  if (owned && phase === 'waiting-backoff') {
    reconnectLog('info', 'ignoring disconnect during backoff');
    return;
  }

  if (consumeCloseBudget()) {
    return;
  }

  if (owned) {
    onLoginFailedDuringReconnect(RECONNECT_FAIL.MID_PIPELINE);
    return;
  }

  if (!shouldHandleDisconnect()) {
    return;
  }

  const store = useReconnectStore.getState();
  const macroStatus = useMacroLifecycleStore.getState().status;
  const wasActive = macroStatus === MacroStatus.Running || macroStatus === MacroStatus.Paused;

  if (macroStatus !== MacroStatus.Idle) {
    stopMacro();
  }
  store.setMacroShouldRestart(wasActive);

  const nextAttempt = store.attempt + 1;
  store.setAttempt(nextAttempt);
  reconnectLog('info', `unexpected disconnect — starting attempt ${nextAttempt}`);
  scheduleAttempt(nextAttempt);
};

/** @returns true if bridge should stop (error handled as reconnect noise or fail). */
export const onReconnectConnectionError = (): boolean => {
  if (!owned) return false;

  const phase = useReconnectStore.getState().phase;
  if (phase === 'waiting-backoff' || phase === 'failed') {
    reconnectLog('info', `ignoring connection error in phase=${phase}`);
    return true;
  }

  if (consumeCloseBudget()) {
    return true;
  }

  onLoginFailedDuringReconnect(RECONNECT_FAIL.CONNECTION_ERROR);
  return true;
};

const scheduleAttempt = (attempt: number): void => {
  const store = useReconnectStore.getState();
  const max = store.maxAttempts;

  if (attempt > max) {
    failAll(RECONNECT_FAIL.EXHAUSTED);
    return;
  }

  owned = true;
  generation += 1;
  const gen = generation;
  const delay = reconnectBackoffMs(attempt);
  const nextAt = Date.now() + delay;

  clearConnectTimer();
  clearHandshakeTimer();

  store.setPhase(delay > 0 ? 'waiting-backoff' : 'reconnecting');
  store.setAttempt(attempt);
  store.setNextRetryAt(nextAt);
  useUIStore.getState().setScreen('reconnecting');
  useUIStore.getState().setLoading(false);

  clearRetryTimer();
  reconnectLog('info', `scheduling attempt ${attempt}/${max} in ${delay}ms`);

  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (gen !== generation) return;
    void runAttempt(gen, attempt);
  }, delay);
};

const failAll = (message: string): void => {
  const store = useReconnectStore.getState();
  // Mark failed before clearing ownership so residual status cannot re-arm reconnect.
  store.setPhase('failed');
  store.setLastError(message);
  store.setNextRetryAt(null);
  cancelReconnect(message);
  useUIStore.getState().setLoading(false);
  useUIStore.getState().setScreen('reconnect-failed');
};

const runAttempt = async (gen: number, attempt: number): Promise<void> => {
  if (gen !== generation) return;

  const store = useReconnectStore.getState();
  const bag = store.getActiveBag();
  if (!store.enabled || !isBagArmed(bag) || !bag?.channel) {
    failAll(RECONNECT_FAIL.CREDENTIALS);
    return;
  }

  store.setPhase('reconnecting');
  store.setNextRetryAt(null);
  useUIStore.getState().setScreen('reconnecting');

  useAuthStore.getState().setCredentials(bag.username, bag.password);
  useAuthStore.getState().setToken(bag.token);
  useAuthStore.getState().setHardwareIdentitySeed(bag.hardwareIdentitySeed);
  useAuthStore.getState().setProxyListUrl(bag.proxyListUrl);
  useConnectionStore.getState().selectChannel(bag.channel);
  useConnectionStore.getState().setStatus('connecting');

  grantCloseBudget();
  try {
    gameApi.disconnect();
  } catch {
    // ignore
  }

  await sleep(50);
  if (gen !== generation) return;

  reconnectLog('info', `connect attempt ${attempt} → ${bag.channel.name}`);
  gameApi.connect(bag.channel, bag.proxyListUrl);
  if (!bag.proxyListUrl) armConnectTimeout(gen);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const onTokenAcceptedDuringReconnect = (): void => {
  if (!owned) return;
  const bag = useReconnectStore.getState().getActiveBag();
  if (!bag || !isBagArmed(bag)) {
    onLoginFailedDuringReconnect(RECONNECT_FAIL.TOKEN_INVALID);
    return;
  }
  reconnectLog('info', `token OK — selecting char slot ${bag.charIndex}`);
  gameApi.selectCharacter(bag.charIndex);
};

export const onLoginFailedDuringReconnect = (reason: string): void => {
  if (!owned) return;
  reconnectLog('warn', `attempt failed: ${reason}`);
  clearConnectTimer();
  clearHandshakeTimer();

  grantCloseBudget();
  try {
    gameApi.disconnect();
  } catch {
    // ignore
  }

  const store = useReconnectStore.getState();
  const next = store.attempt + 1;
  if (next > store.maxAttempts) {
    failAll(reason);
    return;
  }
  store.setAttempt(next);
  store.setLastError(reason);
  scheduleAttempt(next);
};

export const onCharToWorldDuringReconnect = (): void => {
  const store = useReconnectStore.getState();

  if (!owned) {
    if (store.suppressReconnect) store.setSuppressReconnect(false);
    return;
  }

  const shouldRestart = store.macroShouldRestart;

  generation += 1;
  clearAllTimers();
  owned = false;
  closeBudget = 0;

  store.setPhase('armed');
  store.setAttempt(0);
  store.setNextRetryAt(null);
  store.setLastError(null);
  store.setMacroShouldRestart(false);
  store.setSuppressReconnect(false);
  useUIStore.getState().setLoading(false);

  reconnectLog('info', 'CharToWorld — session restored');

  if (shouldRestart) {
    reconnectLog('info', 'restarting macro from step 1');
    stopMacro();
    startMacro(0);
  }
};
