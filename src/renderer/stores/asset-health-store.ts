import { create } from 'zustand';
import type { AssetHealth } from '@shared/types/asset-health-types';

/**
 * In-game surface for a degraded item/skill database. Set from `ItemDb.meta.degraded`
 * when ≥1 boot-critical asset failed to parse (or the user chose "continuar com
 * dados anteriores"). Drives a persistent, non-dismissable banner so a partial DB
 * is never silent. Cleared only by a subsequent clean load.
 */
interface AssetHealthState {
  health: AssetHealth | null;
  setHealth: (health: AssetHealth | null) => void;
}

export const useAssetHealthStore = create<AssetHealthState>((set) => ({
  health: null,
  setHealth: (health) => set({ health }),
}));
