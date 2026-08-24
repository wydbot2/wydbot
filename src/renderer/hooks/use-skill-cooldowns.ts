import { useEffect, useState } from 'react';
import { onMacroEvent } from '../lib/macro-events';

interface CooldownState {
  readonly cooldowns: Readonly<Record<number, number>>;
  readonly activePriority: number | null;
}

const EMPTY_STATE: CooldownState = { cooldowns: {}, activePriority: null };

export const useSkillCooldowns = (): CooldownState => {
  const [state, setState] = useState<CooldownState>(EMPTY_STATE);
  useEffect(() => {
    return onMacroEvent((e) => {
      if (e.kind === 'skillCastFired') {
        // Cooldowns are global (keyed by skillId); the highlight is exclusive to
        // the attack rotation, so buff/other casts must not move activePriority.
        setState((prev) => ({
          cooldowns: { ...prev.cooldowns, [e.skillId]: e.cooldownEndsMs },
          activePriority: e.source === 'attack-magical' ? e.priority : prev.activePriority,
        }));
        return;
      }
      // Engagement returned to idle — clear the highlight but preserve cooldown
      // timestamps so re-engaging within a few seconds still shows real CDs.
      if (e.kind === 'combatEnded' && e.source === 'attack-magical') {
        setState((prev) => ({ cooldowns: prev.cooldowns, activePriority: null }));
      }
    });
  }, []);
  return state;
};
