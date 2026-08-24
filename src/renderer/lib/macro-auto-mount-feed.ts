import { isFoodForMount } from '@shared/constants/mount-food-pairs';
import { useAppConfigStore } from '../stores/app-config-store';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from './game-api';
import { registerAmbientModule } from './macro-engine';
import { logMacro } from './macro-log';

const FEED_COOLDOWN_MS = 500;

let lastFedAt = 0;

registerAmbientModule({
  name: 'auto-mount-feed',
  pollIntervalMs: 500,
  lifecycle: 'macro-coupled',

  tick: async (signal) => {
    if (signal.aborted) return;
    const cfg = useAppConfigStore.getState().config.misc?.autoHealing;
    if (!cfg?.enabled) return;
    const feedCfg = cfg.mountFeed;
    if (!feedCfg?.enabled || feedCfg.actions.length === 0) return;

    const { mount, inventory } = usePlayerStore.getState();
    if (!mount.equipped) return;

    const hpThreshold = (feedCfg.thresholdPct * mount.maxHp) / 100;
    const branchA = mount.hp > 0 && mount.hp < hpThreshold;
    const branchB = mount.feed >= 1 && mount.feed <= 5;
    if (!branchA && !branchB) return;

    const now = Date.now();
    if (now - lastFedAt < FEED_COOLDOWN_MS) return;

    for (const action of feedCfg.actions) {
      if (action.kind !== 'item') continue;
      if (!isFoodForMount(mount.itemId, action.refId)) continue;
      const slot = inventory.findIndex((it) => it?.index === action.refId);
      if (slot < 0) continue;
      if (!gameApi.useItem(slot, action.refId, 0xe)) continue;
      lastFedAt = now;
      logMacro(
        'info',
        `[auto-mount-feed] alimentou montaria id=${mount.itemId} com ração slot=${slot} id=${action.refId}`,
      );
      return;
    }
  },

  reset: () => {
    lastFedAt = 0;
  },
});
