import { create } from 'zustand';
import {
  DEFAULT_RECONNECT_MAX_ATTEMPTS,
  emptyReconnectBag,
  isBagArmed,
  type ReconnectBag,
} from '../lib/reconnect-helpers';

/**
 * Misc → Reconnect RAM state. Bags keyed by the machine-binding key;
 * never written to AppConfig.
 */

export type ReconnectPhase =
  | 'idle'
  | 'incomplete'
  | 'armed'
  | 'reconnecting'
  | 'waiting-backoff'
  | 'failed';

interface ReconnectState {
  /** Same string as main `getMachineBindingKey`. */
  bagKey: string | null;
  bags: Record<string, ReconnectBag>;
  enabled: boolean;
  phase: ReconnectPhase;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: number | null;
  lastError: string | null;
  macroShouldRestart: boolean;
  /** Blocks reconnect after intentional logout / access halt. */
  suppressReconnect: boolean;

  setBagKey: (key: string) => void;
  setEnabled: (enabled: boolean) => void;
  upsertActiveBag: (patch: Partial<ReconnectBag>) => void;
  getActiveBag: () => ReconnectBag | null;
  setPhase: (phase: ReconnectPhase) => void;
  setAttempt: (attempt: number) => void;
  setNextRetryAt: (at: number | null) => void;
  setLastError: (error: string | null) => void;
  setMacroShouldRestart: (v: boolean) => void;
  setSuppressReconnect: (v: boolean) => void;
  disarm: () => void;
  reset: () => void;
}

const getActiveBagFrom = (
  bagKey: string | null,
  bags: Record<string, ReconnectBag>,
): ReconnectBag | null => {
  if (!bagKey) return null;
  return bags[bagKey] ?? null;
};

export const useReconnectStore = create<ReconnectState>((set, get) => ({
  bagKey: null,
  bags: {},
  enabled: false,
  phase: 'idle',
  attempt: 0,
  maxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
  nextRetryAt: null,
  lastError: null,
  macroShouldRestart: false,
  suppressReconnect: false,

  setBagKey: (key) =>
    set((state) => {
      const bags = state.bags[key] ? state.bags : { ...state.bags, [key]: emptyReconnectBag() };
      return { bagKey: key, bags };
    }),

  setEnabled: (enabled) => set({ enabled }),

  upsertActiveBag: (patch) =>
    set((state) => {
      const key = state.bagKey;
      if (!key) return state;
      const current = state.bags[key] ?? emptyReconnectBag();
      return {
        bags: {
          ...state.bags,
          [key]: { ...current, ...patch },
        },
      };
    }),

  getActiveBag: () => getActiveBagFrom(get().bagKey, get().bags),

  setPhase: (phase) => set({ phase }),
  setAttempt: (attempt) => set({ attempt }),
  setNextRetryAt: (nextRetryAt) => set({ nextRetryAt }),
  setLastError: (lastError) => set({ lastError }),
  setMacroShouldRestart: (macroShouldRestart) => set({ macroShouldRestart }),
  setSuppressReconnect: (suppressReconnect) => set({ suppressReconnect }),

  disarm: () =>
    set((state) => {
      const key = state.bagKey;
      const bags = { ...state.bags };
      if (key) {
        bags[key] = emptyReconnectBag();
      }
      return {
        bags,
        enabled: false,
        phase: 'idle',
        attempt: 0,
        nextRetryAt: null,
        lastError: null,
        macroShouldRestart: false,
        suppressReconnect: false,
      };
    }),

  reset: () =>
    set({
      bagKey: null,
      bags: {},
      enabled: false,
      phase: 'idle',
      attempt: 0,
      maxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
      nextRetryAt: null,
      lastError: null,
      macroShouldRestart: false,
      suppressReconnect: false,
    }),
}));

export const selectActiveReconnectBag = (s: ReconnectState): ReconnectBag | null =>
  getActiveBagFrom(s.bagKey, s.bags);

export const selectIsReconnectArmed = (s: ReconnectState): boolean =>
  s.enabled && isBagArmed(getActiveBagFrom(s.bagKey, s.bags));

export { isBagArmed, type ReconnectBag };
