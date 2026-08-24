import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/player-store';
import { runSkillDivergenceCheck } from '../lib/skill-divergence-check';

/**
 * Re-runs the divergence check when the character becomes known or changes
 * (Learn[0]/Learn[1]/class change in `setCharToWorld`). Covers a config loaded
 * before login. Gated so it never fires pre-login.
 */
export const useSkillDivergenceWatch = (): void => {
  const { learn0, learn1, charClass } = usePlayerStore(
    useShallow((player) => ({
      learn0: player.learnedSkill[0],
      learn1: player.learnedSkill[1],
      charClass: player.charClass,
    })),
  );

  useEffect(() => {
    if (!learn0 && !learn1) return;
    runSkillDivergenceCheck();
  }, [learn0, learn1, charClass]);
};
