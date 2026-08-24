import type { AppConfigV1 } from '../app-config';
import type { HealAction } from '../app-config/v1/sections/auto-healing';

/**
 * Skills referenced by a config that the logged-in character has NOT learned.
 *
 * Pure — no stores, no catalog. `detectSkillDivergence` reports the divergent
 * ids grouped by feature (for the warning modal); `sanitizeConfigSkills` strips
 * them, returning a config the character can actually run. Friendly-name
 * resolution stays in the renderer (it needs `SkillData.bin`), keeping
 * `shared/` a leaf.
 */

export type SkillDivergenceFeature =
  | 'attackRotation'
  | 'autoBuff'
  | 'autoSummon'
  | 'autoHealingHp'
  | 'autoHealingDebuffCure';

export interface SkillDivergenceGroup {
  feature: SkillDivergenceFeature;
  featureLabelPtBr: string;
  /** Unlearned ids, deduped, in first-seen config order. */
  skillIds: number[];
}

export interface SkillDivergenceReport {
  hasDivergence: boolean;
  /** Only features with ≥1 divergent id. */
  groups: SkillDivergenceGroup[];
}

const FEATURE_LABELS: Record<SkillDivergenceFeature, string> = {
  attackRotation: 'Ataque Mágico (rotação de skills)',
  autoBuff: 'Auto Buff',
  autoSummon: 'Auto Summon',
  autoHealingHp: 'Auto Healing — HP',
  autoHealingDebuffCure: 'Auto Healing — Cura de Debuff',
};

/** Only `kind: 'skill'` is a skill id; `kind: 'item'` reuses `refId` for items. */
const skillRefIds = (actions: readonly HealAction[]): number[] =>
  actions.filter((a) => a.kind === 'skill').map((a) => a.refId);

const unlearned = (ids: readonly number[], learned: ReadonlySet<number>): number[] => {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (learned.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

export const detectSkillDivergence = (
  config: AppConfigV1,
  learnedSkillIds: ReadonlySet<number>,
): SkillDivergenceReport => {
  const groups: SkillDivergenceGroup[] = [];

  const collect = (feature: SkillDivergenceFeature, ids: readonly number[]): void => {
    const skillIds = unlearned(ids, learnedSkillIds);
    if (skillIds.length > 0) {
      groups.push({ feature, featureLabelPtBr: FEATURE_LABELS[feature], skillIds });
    }
  };

  const rotationIds = (config.attack?.rotation?.slots ?? [])
    .filter((slot): slot is { skillId: number } => slot != null)
    .map((slot) => slot.skillId);
  collect('attackRotation', rotationIds);

  // `mp`/`mountFeed` are item-only at runtime — only `hp`/`debuffCure` cast skills.
  const healing = config.misc?.autoHealing;
  collect('autoBuff', config.misc?.autoBuff?.skills ?? []);
  const summonId = config.misc?.autoSummon?.skill;
  collect('autoSummon', summonId != null ? [summonId] : []);
  collect('autoHealingHp', skillRefIds(healing?.hp?.actions ?? []));
  collect('autoHealingDebuffCure', skillRefIds(healing?.debuffCure?.actions ?? []));

  return { hasDivergence: groups.length > 0, groups };
};

export interface SanitizeConfigResult {
  config: AppConfigV1;
  report: SkillDivergenceReport;
}

/** A heal sub-feature emptied of all actions can't run — disable to stay schema-valid on save. */
const stripHealSkills = <T extends { enabled: boolean; actions: HealAction[] }>(
  sub: T | undefined,
  learned: ReadonlySet<number>,
): T | undefined => {
  if (!sub) return sub;
  const actions = sub.actions.filter((a) => a.kind !== 'skill' || learned.has(a.refId));
  if (actions.length === sub.actions.length) return sub;
  return { ...sub, actions, enabled: sub.enabled && actions.length > 0 };
};

/**
 * Removes every unlearned skill from the config (rotation slots → null, auto-buff
 * and heal skill actions filtered) and returns the cleaned config plus the
 * divergence report. Returns the input untouched when there is no divergence.
 */
export const sanitizeConfigSkills = (
  config: AppConfigV1,
  learnedSkillIds: ReadonlySet<number>,
): SanitizeConfigResult => {
  const report = detectSkillDivergence(config, learnedSkillIds);
  if (!report.hasDivergence) return { config, report };

  let next = config;

  if (config.attack?.rotation?.slots) {
    const slots = config.attack.rotation.slots.map((slot) =>
      slot && !learnedSkillIds.has(slot.skillId) ? null : slot,
    );
    next = { ...next, attack: { ...next.attack, rotation: { slots } } };
  }

  if (config.misc) {
    let misc = config.misc;
    if (misc.autoBuff) {
      const skills = misc.autoBuff.skills.filter((id) => learnedSkillIds.has(id));
      misc = { ...misc, autoBuff: { ...misc.autoBuff, skills } };
    }
    if (misc.autoSummon?.skill != null && !learnedSkillIds.has(misc.autoSummon.skill)) {
      misc = { ...misc, autoSummon: { ...misc.autoSummon, skill: null } };
    }
    if (misc.autoHealing) {
      misc = {
        ...misc,
        autoHealing: {
          ...misc.autoHealing,
          hp: stripHealSkills(misc.autoHealing.hp, learnedSkillIds),
          debuffCure: stripHealSkills(misc.autoHealing.debuffCure, learnedSkillIds),
        },
      };
    }
    next = { ...next, misc };
  }

  return { config: next, report };
};
