import { create } from 'zustand';
import type { ViewSelChar } from '@shared/types';

interface CharlistState {
  selChar: ViewSelChar | null;
  selectedIndex: number;

  setSelChar: (selChar: ViewSelChar) => void;
  selectCharacter: (index: number) => void;
  reset: () => void;
}

export const useCharlistStore = create<CharlistState>((set) => ({
  selChar: null,
  selectedIndex: -1,

  setSelChar: (selChar) => set({ selChar }),
  selectCharacter: (index) => set({ selectedIndex: index }),
  reset: () => set({ selChar: null, selectedIndex: -1 }),
}));
