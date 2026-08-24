import { create } from 'zustand';
import type { IpcLogEntry } from '@shared/ipc/ipc-api';

const MAX_ENTRIES = 5_000;

interface LogState {
  entries: IpcLogEntry[];
  levelFilter: string | null;
  categoryFilter: string | null;

  addBatch: (batch: IpcLogEntry[]) => void;
  setLevelFilter: (level: string | null) => void;
  setCategoryFilter: (category: string | null) => void;
  clear: () => void;
}

/** Selector for filtered entries — use with useLogStore(selectFilteredEntries) */
export const selectFilteredEntries = (state: LogState): IpcLogEntry[] => {
  let result = state.entries;
  if (state.levelFilter) {
    result = result.filter((e) => e.level === state.levelFilter);
  }
  if (state.categoryFilter) {
    result = result.filter((e) => e.category === state.categoryFilter);
  }
  return result;
};

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  levelFilter: null,
  categoryFilter: null,

  addBatch: (batch) =>
    set((state) => ({
      entries: [...state.entries, ...batch].slice(-MAX_ENTRIES),
    })),
  setLevelFilter: (level) => set({ levelFilter: level }),
  setCategoryFilter: (category) => set({ categoryFilter: category }),
  clear: () => set({ entries: [] }),
}));
