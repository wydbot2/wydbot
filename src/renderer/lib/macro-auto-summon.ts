import { MISC_AUTO_SUMMON_RECAST_SEC } from '@shared/app-config';
import { useAppConfigStore } from '../stores/app-config-store';
import { gameApi } from './game-api';
import { getSkill } from './item-db';
import { registerAmbientModule } from './macro-engine';
import { emitMacroEvent } from './macro-events';
import { logMacro } from './macro-log';

/** Last cast wall-clock (ms) + which summon it was. Cleared on reset. */
let lastCastMs = 0;
let lastSkillId: number | null = null;

registerAmbientModule({
  name: 'auto-summon',
  pollIntervalMs: 1000,
  lifecycle: 'macro-coupled',

  tick: async (signal) => {
    if (signal.aborted) return;
    const cfg = useAppConfigStore.getState().config.misc?.autoSummon;
    if (!cfg?.enabled || cfg.skill == null) return;

    // Canonical summon bucket: fixed 80 s timer, no affect suppression —
    // Swapping the configured summon re-casts immediately (new pet replaces).
    const now = Date.now();
    if (cfg.skill === lastSkillId && now - lastCastMs < MISC_AUTO_SUMMON_RECAST_SEC * 1000) return;

    const skill = getSkill(cfg.skill);
    if (!skill || skill.name === null) return;

    gameApi.castBuff(cfg.skill, skill.row.packetKind === 1 ? 1 : 0);
    lastCastMs = now;
    lastSkillId = cfg.skill;
    logMacro('info', `[auto-summon] invocou id=${cfg.skill} (${skill.name})`);
    emitMacroEvent({
      kind: 'skillCastFired',
      source: 'auto-summon',
      skillId: cfg.skill,
      priority: 1,
      cooldownEndsMs: now + MISC_AUTO_SUMMON_RECAST_SEC * 1000,
    });
  },

  reset: () => {
    lastCastMs = 0;
    lastSkillId = null;
  },
});
