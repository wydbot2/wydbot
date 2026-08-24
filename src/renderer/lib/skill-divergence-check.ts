import { sanitizeConfigSkills } from '@shared/lib/skill-divergence';
import { useAppConfigStore } from '../stores/app-config-store';
import { useUIStore } from '../stores/ui-store';
import { getLearnedSkillGate } from './learned-skills';
import { buildDivergenceView } from './skill-divergence-view';

/**
 * Strips skills the logged-in character hasn't learned from the active config
 * and opens the warning modal listing what was removed. The on-disk file is
 * left untouched (the swap marks the config dirty). Idempotent and deferred
 * while the character is unknown (pre-login) — an empty set would strip
 * everything.
 */
export const runSkillDivergenceCheck = (): void => {
  const learned = getLearnedSkillGate();
  if (!learned) return;
  const { config, replaceConfig } = useAppConfigStore.getState();
  const { config: cleaned, report } = sanitizeConfigSkills(config, learned);
  if (!report.hasDivergence) return;
  replaceConfig(cleaned);
  useUIStore.getState().showSkillDivergence(buildDivergenceView(report));
};
