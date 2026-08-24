import { useAppConfigStore } from '../stores/app-config-store';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from './game-api';
import { registerAmbientModule } from './macro-engine';
import { logMacro } from './macro-log';

const MP_COOLDOWN_MS = 300;

let lastMpUseAt = 0;

registerAmbientModule({
  name: 'auto-mp',
  pollIntervalMs: 500,
  lifecycle: 'macro-coupled',

  tick: async (signal) => {
    if (signal.aborted) return;
    const cfg = useAppConfigStore.getState().config.misc?.autoHealing;
    if (!cfg?.enabled) return;
    const mpCfg = cfg.mp;
    if (!mpCfg?.enabled || mpCfg.actions.length === 0) return;

    const { currentMp, maxMp, inventory } = usePlayerStore.getState();
    if (maxMp === 0) return;
    if ((currentMp / maxMp) * 100 >= mpCfg.thresholdPct) return;

    const now = Date.now();
    if (now - lastMpUseAt < MP_COOLDOWN_MS) return;

    // MP é item-only por schema; itera actions[] e dispara o primeiro presente no bag.
    for (const action of mpCfg.actions) {
      const slot = inventory.findIndex((it) => it?.index === action.refId);
      if (slot < 0) continue;
      const emitted = gameApi.useItem(slot, action.refId, 0);
      if (!emitted) continue;
      lastMpUseAt = now;
      logMacro('info', `[auto-mp] usou item slot=${slot} id=${action.refId}`);
      return;
    }
  },

  reset: () => {
    lastMpUseAt = 0;
  },
});
