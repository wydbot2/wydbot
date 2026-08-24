import { MISC_AUTO_BUFF_RECAST_FLOOR_SEC } from '@shared/app-config';
import { isCastTypeActive } from '@shared/lib/buff-suppression';
import { useAppConfigStore } from '../stores/app-config-store';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from './game-api';
import { getSkill } from './item-db';
import { registerAmbientModule } from './macro-engine';
import { emitMacroEvent } from './macro-events';
import { logMacro } from './macro-log';

/** Per-skill last-cast wall-clock (ms). Cleared on reset. */
const cooldownMap = new Map<number, number>();
let lastSkipKey: string | null = null;

const logSkip = (key: string, message: string): void => {
  if (lastSkipKey === key) return;
  lastSkipKey = key;
  logMacro('warn', `[auto-buff] ${message}`);
};

/**
 * incl. the 0x47 shield-group special. No 0x336 yet → defer to the timer.
 */
const isAffectActive = (skillId: number): boolean => {
  const { affects, affectsSyncMs } = usePlayerStore.getState();
  if (affectsSyncMs === 0) return false;
  return isCastTypeActive(skillId, affects);
};

registerAmbientModule({
  name: 'auto-buff',
  pollIntervalMs: 1000,
  lifecycle: 'macro-coupled',

  tick: async (signal) => {
    if (signal.aborted) return;
    const cfg = useAppConfigStore.getState().config.misc?.autoBuff;
    if (!cfg?.enabled) return;
    if (cfg.skills.length === 0) {
      logSkip('empty', 'nenhuma buff selecionada');
      return;
    }

    const now = Date.now();

    // First-match scan, one cast per tick (parity with the attack rotation).
    for (const skillId of cfg.skills) {
      const skill = getSkill(skillId);
      if (!skill || skill.name === null) continue;

      // Recast is driven by the affect-table guard (real buff duration); the
      // timer is the fallback interval until 0x336 affect feedback arrives.
      const intervalSec =
        cfg.recastIntervalSec ?? Math.max(skill.row.cooldownSecs, MISC_AUTO_BUFF_RECAST_FLOOR_SEC);
      const lastCast = cooldownMap.get(skillId) ?? 0;
      if (now - lastCast < intervalSec * 1000) continue;
      if (isAffectActive(skillId)) continue;

      gameApi.castBuff(skillId, skill.row.packetKind === 1 ? 1 : 0);
      cooldownMap.set(skillId, now);
      lastSkipKey = null;
      logMacro('info', `[auto-buff] disparou buff id=${skillId} (${skill.name})`);
      emitMacroEvent({
        kind: 'skillCastFired',
        source: 'auto-buff',
        skillId,
        priority: cfg.skills.indexOf(skillId) + 1,
        cooldownEndsMs: now + intervalSec * 1000,
      });
      return;
    }
  },

  reset: () => {
    cooldownMap.clear();
    lastSkipKey = null;
  },
});
