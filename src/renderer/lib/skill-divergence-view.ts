import type { SkillDivergenceReport } from '@shared/lib/skill-divergence';
import { getSkill } from './item-db';

/** Display row: feature + divergent skills with friendly names. */
export interface DivergenceViewSkill {
  id: number;
  name: string;
}

export interface DivergenceViewGroup {
  featureLabelPtBr: string;
  skills: DivergenceViewSkill[];
}

/** Enriches the pure report with catalog names (fallback `Skill #id`). */
export const buildDivergenceView = (report: SkillDivergenceReport): DivergenceViewGroup[] =>
  report.groups.map((group) => ({
    featureLabelPtBr: group.featureLabelPtBr,
    skills: group.skillIds.map((id) => ({ id, name: getSkill(id)?.name ?? `Skill #${id}` })),
  }));
