import { create } from 'zustand';

interface NavigationState {
  currentStepIndex: number;

  setCurrentIndex: (index: number) => void;
  reset: (fromIndex?: number) => void;
}

export const useMacroNavigationStore = create<NavigationState>((set) => ({
  currentStepIndex: 0,

  setCurrentIndex: (index) => set({ currentStepIndex: index }),
  reset: (fromIndex) => set({ currentStepIndex: fromIndex ?? 0 }),
}));
