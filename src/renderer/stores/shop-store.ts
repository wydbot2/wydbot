import { create } from 'zustand';
import type { IpcShopItem } from '@shared/ipc/ipc-api';

/** Transient S2C 0x17C shop inventory for probe/macro buy resolution. */

export interface ShopState {
  items: IpcShopItem[];
  /** Monotonic freshness counter (bumped on each setItems; never reset by clear). */
  epoch: number;
}

export interface ShopStore extends ShopState {
  setItems: (items: IpcShopItem[]) => void;
  clear: () => void;
}

const initial: ShopState = { items: [], epoch: 0 };

export const useShopStore = create<ShopStore>((set) => ({
  ...initial,
  setItems: (items) => set((s) => ({ items, epoch: s.epoch + 1 })),
  clear: () => set((s) => ({ items: [], epoch: s.epoch })),
}));
