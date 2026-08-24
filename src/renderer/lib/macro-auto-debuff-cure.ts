import { isCurableDebuff } from '@shared/constants/curable-debuffs';
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
  name: 'auto-debuff-cure',
  pollIntervalMs: 250,
  lifecycle: 'macro-coupled',

  tick: async (signal) => {
    if (signal.aborted) return;
    const cfg = useAppConfigStore.getState().config.misc?.autoHealing;
    if (!cfg?.enabled) return;
    const cureCfg = cfg.debuffCure;
    if (!cureCfg?.enabled) return;

    const { affects, inventory } = usePlayerStore.getState();
    // `timeOctets > 0` filtra slots vazios/expirados; `isCurableDebuff` cobre v1
    // (lentidão + dois venenos).
    const hasCurable = affects.some((a) => a.timeOctets > 0 && isCurableDebuff(a.type));
    if (!hasCurable) return;

    const now = Date.now();
    const action = pickHealingAction({
      actions: cureCfg.actions,
      inventory,
      itemDb: getItemDb(),
      now,
      lastSkillCastAt,
      lastItemUseAt,
    });
    if (!action) return;

    if (action.kind === 'skill') {
      // `packetKind` discrimina o wire: Desintoxicar
      // `0x19` = 1 → 0x39D; lookup defensivo se CURE_SKILL_IDS for expandido.
      const skill = getItemDb().skillsById.get(action.skillId);
      const packetKind = skill?.row.packetKind === 1 ? 1 : 0;
      gameApi.castBuff(action.skillId, packetKind);
      lastSkillCastAt = now;
      logMacro(
        'info',
        `[auto-debuff-cure] disparou skill id=${action.skillId} (packetKind=${packetKind})`,
      );
      return;
    }

    const emitted = gameApi.useItem(action.slot, action.itemId, action.feedMarker);
    if (!emitted) return;
    lastItemUseAt = now;
    logMacro('info', `[auto-debuff-cure] usou erva slot=${action.slot} id=${action.itemId}`);
  },

  reset: () => {
    lastSkillCastAt = 0;
    lastItemUseAt = 0;
  },
});
