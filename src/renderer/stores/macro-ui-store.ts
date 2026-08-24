import { create } from 'zustand';

/**
 * UI editor cursor — the step selected in the macro panel list. Pure
 * renderer concern; independent of `currentStepIndex` (the run cursor).
 * `reset` is called by `useMacroLifecycleStore.start/stop`.
 */
interface UiState {
  selectedStepIndex: number | null;

  setSelectedIndex: (index: number | null) => void;
  reset: () => void;
}

export const useMacroUiStore = create<UiState>((set) => ({
  selectedStepIndex: null,
  setSelectedIndex: (index) => set({ selectedStepIndex: index }),
  reset: () => set({ selectedStepIndex: null }),
}));
