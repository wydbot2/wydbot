import { create } from 'zustand';
import { MacroStatus } from './macro-status';
import { useMacroNavigationStore } from './macro-navigation-store';
import { useMacroUiStore } from './macro-ui-store';

/**
 * Macro state machine — Idle / Running / Paused plus an optional message
 * when paused by an error. The orchestrator of macro runtime: `start` and
 * `stop` cascade resets into Navigation and UI before flipping `status`,
 * guaranteeing the engine's first tick sees a coherent cross-domain state.
 */
interface LifecycleState {
  status: MacroStatus;
  statusMessage: string | null;

  start: (fromIndex?: number) => void;
  pause: (message?: string) => void;
  resume: () => void;
  stop: () => void;
}

export const useMacroLifecycleStore = create<LifecycleState>((set) => ({
  status: MacroStatus.Idle,
  statusMessage: null,

  start: (fromIndex) => {
    // Navigation+UI reset BEFORE status flips — engine starts ticking on
    // status === Running and must read the new currentStepIndex.
    useMacroNavigationStore.getState().reset(fromIndex);
    useMacroUiStore.getState().reset();
    set({ status: MacroStatus.Running, statusMessage: null });
  },

  pause: (message) => set({ status: MacroStatus.Paused, statusMessage: message ?? null }),

  resume: () =>
    set((state) =>
      state.status === MacroStatus.Paused
        ? { status: MacroStatus.Running, statusMessage: null }
        : state,
    ),

  stop: () => {
    useMacroNavigationStore.getState().reset();
    useMacroUiStore.getState().reset();
    set({ status: MacroStatus.Idle, statusMessage: null });
  },
}));
