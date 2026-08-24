import { useAppConfigStore } from '../stores/app-config-store';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from './game-api';
import { pickHealingAction } from './healing-pick-action';
import { getItemDb } from './item-db';
import { registerAmbientModule } from './macro-engine';
import { logMacro } from './macro-log';

let lastSkillCastAt = 0;
let lastItemUseAt = 0;

registerAmbientModule({
  name: 'auto-hp',
  pollIntervalMs: 250,
  lifecycle: 'macro-coupled',

  tick: async (signal) => {
    if (signal.aborted) return;
    const cfg = useAppConfigStore.getState().config.misc?.autoHealing;
    if (!cfg?.enabled) return;
    const hpCfg = cfg.hp;
    if (!hpCfg?.enabled) return;

    const { currentHp, maxHp, inventory } = usePlayerStore.getState();
    if (maxHp === 0) return;
    if ((currentHp / maxHp) * 100 >= hpCfg.thresholdPct) return;

    const now = Date.now();
    const action = pickHealingAction({
      actions: hpCfg.actions,
      inventory,
      itemDb: getItemDb(),
      now,
      lastSkillCastAt,
      lastItemUseAt,
    });
    if (!action) return;

    if (action.kind === 'skill') {
      // `packetKind` discrimina o wire: Cura `0x1b` = 1 → 0x39D self-target;
      // Recuperar `0x1d` = 13 → 0x367 generic.
      const skill = getItemDb().skillsById.get(action.skillId);
      const packetKind = skill?.row.packetKind === 1 ? 1 : 0;
      gameApi.castBuff(action.skillId, packetKind);
      lastSkillCastAt = now;
      logMacro('info', `[auto-hp] disparou skill id=${action.skillId} (packetKind=${packetKind})`);
      return;
    }

    const emitted = gameApi.useItem(action.slot, action.itemId, action.feedMarker);
    if (!emitted) return;
    lastItemUseAt = now;
    logMacro('info', `[auto-hp] usou item slot=${action.slot} id=${action.itemId}`);
  },

  reset: () => {
    lastSkillCastAt = 0;
    lastItemUseAt = 0;
  },
});
