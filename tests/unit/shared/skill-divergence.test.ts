/**
 * Unit tests for `detectSkillDivergence` (src/shared/lib/skill-divergence.ts).
 *
 * Cobre todos os campos que carregam skill id: rotação de ataque mágico,
 * auto-buff e os três `actions[]` de auto-healing com `kind: 'skill'`. O caso
 * decisivo é a union `HealAction`: `kind: 'item'` reusa `refId` mas é id de
 * ITEM e nunca pode ser flagado como skill divergente.
 */
import { describe, it, expect } from 'vitest';
import {
  detectSkillDivergence,
  sanitizeConfigSkills,
} from '../../../src/shared/lib/skill-divergence';
import type { AppConfigV1 } from '../../../src/shared/app-config';

const baseConfig = (overrides: Partial<AppConfigV1>): AppConfigV1 =>
  ({ version: 1, name: 'test', ...overrides }) as AppConfigV1;

describe('detectSkillDivergence', () => {
  it('(a) empty learned set flags every configured skill id', () => {
    const config = baseConfig({
      attack: { rotation: { slots: [{ skillId: 10 }, null, { skillId: 11 }] } },
      misc: { autoBuff: { enabled: true, skills: [20, 21] } },
    });
    const report = detectSkillDivergence(config, new Set());
    expect(report.hasDivergence).toBe(true);
    expect(report.groups.find((g) => g.feature === 'attackRotation')?.skillIds).toEqual([10, 11]);
    expect(report.groups.find((g) => g.feature === 'autoBuff')?.skillIds).toEqual([20, 21]);
  });

  it('(b) all learned → no divergence', () => {
    const config = baseConfig({
      attack: { rotation: { slots: [{ skillId: 10 }] } },
      misc: { autoBuff: { enabled: true, skills: [20] } },
    });
    const report = detectSkillDivergence(config, new Set([10, 20]));
    expect(report.hasDivergence).toBe(false);
    expect(report.groups).toEqual([]);
  });

  it('(c) heal kind:item refId is NEVER flagged as a skill, even if unlearned-as-skill', () => {
    const config = baseConfig({
      misc: {
        autoHealing: {
          enabled: true,
          hp: {
            enabled: true,
            thresholdPct: 50,
            actions: [
              { kind: 'item', refId: 2001 }, // item id — must be ignored
              { kind: 'skill', refId: 0x1d }, // skill id — must be flagged
            ],
          },
        },
      },
    });
    const report = detectSkillDivergence(config, new Set());
    const hp = report.groups.find((g) => g.feature === 'autoHealingHp');
    expect(hp?.skillIds).toEqual([0x1d]);
    expect(hp?.skillIds).not.toContain(2001);
  });

  it('flags an unlearned auto-summon skill', () => {
    const config = baseConfig({
      misc: { autoSummon: { enabled: true, skill: 0x38 } },
    });
    const report = detectSkillDivergence(config, new Set());
    expect(report.groups.find((g) => g.feature === 'autoSummon')?.skillIds).toEqual([0x38]);
  });

  it('auto-summon with a learned skill or skill: null → no divergence', () => {
    const learned = detectSkillDivergence(
      baseConfig({ misc: { autoSummon: { enabled: true, skill: 0x38 } } }),
      new Set([0x38]),
    );
    expect(learned.hasDivergence).toBe(false);
    const none = detectSkillDivergence(
      baseConfig({ misc: { autoSummon: { enabled: true, skill: null } } }),
      new Set(),
    );
    expect(none.hasDivergence).toBe(false);
  });

  it('(d) null rotation slots are skipped', () => {
    const config = baseConfig({
      attack: { rotation: { slots: [null, null, { skillId: 99 }] } },
    });
    const report = detectSkillDivergence(config, new Set());
    expect(report.groups.find((g) => g.feature === 'attackRotation')?.skillIds).toEqual([99]);
  });

  it('(e) duplicate ids across slots are deduped (first-seen order)', () => {
    const config = baseConfig({
      attack: { rotation: { slots: [{ skillId: 7 }, { skillId: 7 }, { skillId: 3 }] } },
    });
    const report = detectSkillDivergence(config, new Set());
    expect(report.groups.find((g) => g.feature === 'attackRotation')?.skillIds).toEqual([7, 3]);
  });

  it('(f) mp.actions is item-only and never scanned for skills', () => {
    const config = baseConfig({
      misc: {
        autoHealing: {
          enabled: true,
          mp: { enabled: true, thresholdPct: 50, actions: [{ kind: 'item', refId: 5000 }] },
        },
      },
    });
    const report = detectSkillDivergence(config, new Set());
    expect(report.hasDivergence).toBe(false);
  });

  it('groups hp + debuffCure skill sources independently', () => {
    const config = baseConfig({
      misc: {
        autoHealing: {
          enabled: true,
          hp: { enabled: true, thresholdPct: 50, actions: [{ kind: 'skill', refId: 0x1d }] },
          debuffCure: { enabled: true, actions: [{ kind: 'skill', refId: 0x19 }] },
        },
      },
    });
    const report = detectSkillDivergence(config, new Set());
    expect(report.groups.map((g) => g.feature).sort()).toEqual([
      'autoHealingDebuffCure',
      'autoHealingHp',
    ]);
  });

  it('mountFeed skill actions are item-only at runtime → never flagged', () => {
    const config = baseConfig({
      misc: {
        autoHealing: {
          enabled: true,
          mountFeed: { enabled: true, thresholdPct: 30, actions: [{ kind: 'skill', refId: 0x40 }] },
        },
      },
    });
    const report = detectSkillDivergence(config, new Set());
    expect(report.hasDivergence).toBe(false);
  });
});

describe('sanitizeConfigSkills', () => {
  it('returns the input untouched when there is no divergence', () => {
    const config = baseConfig({
      attack: { rotation: { slots: [{ skillId: 10 }] } },
    });
    const result = sanitizeConfigSkills(config, new Set([10]));
    expect(result.config).toBe(config);
    expect(result.report.hasDivergence).toBe(false);
  });

  it('nulls unlearned rotation slots and keeps learned ones', () => {
    const config = baseConfig({
      attack: { rotation: { slots: [{ skillId: 10 }, { skillId: 11 }, null] } },
    });
    const { config: cleaned } = sanitizeConfigSkills(config, new Set([10]));
    expect(cleaned.attack?.rotation?.slots).toEqual([{ skillId: 10 }, null, null]);
  });

  it('filters unlearned ids from auto-buff skills', () => {
    const config = baseConfig({
      misc: { autoBuff: { enabled: true, skills: [20, 21, 22] } },
    });
    const { config: cleaned } = sanitizeConfigSkills(config, new Set([21]));
    expect(cleaned.misc?.autoBuff?.skills).toEqual([21]);
  });

  it('nulls an unlearned auto-summon skill (keeps enabled)', () => {
    const config = baseConfig({
      misc: { autoSummon: { enabled: true, skill: 0x38 } },
    });
    const { config: cleaned } = sanitizeConfigSkills(config, new Set());
    expect(cleaned.misc?.autoSummon).toEqual({ enabled: true, skill: null });
  });

  it('drops unlearned heal skill actions but keeps item actions', () => {
    const config = baseConfig({
      misc: {
        autoHealing: {
          enabled: true,
          hp: {
            enabled: true,
            thresholdPct: 50,
            actions: [
              { kind: 'skill', refId: 0x1d },
              { kind: 'item', refId: 2001 },
            ],
          },
        },
      },
    });
    const { config: cleaned } = sanitizeConfigSkills(config, new Set());
    expect(cleaned.misc?.autoHealing?.hp?.actions).toEqual([{ kind: 'item', refId: 2001 }]);
    expect(cleaned.misc?.autoHealing?.hp?.enabled).toBe(true);
  });

  it('disables a heal sub-feature emptied of all actions (stays schema-valid)', () => {
    const config = baseConfig({
      misc: {
        autoHealing: {
          enabled: true,
          debuffCure: { enabled: true, actions: [{ kind: 'skill', refId: 0x19 }] },
        },
      },
    });
    const { config: cleaned } = sanitizeConfigSkills(config, new Set());
    expect(cleaned.misc?.autoHealing?.debuffCure?.actions).toEqual([]);
    expect(cleaned.misc?.autoHealing?.debuffCure?.enabled).toBe(false);
  });

  it('does not touch mountFeed/mp (item-only) actions', () => {
    const config = baseConfig({
      misc: {
        autoHealing: {
          enabled: true,
          mountFeed: { enabled: true, thresholdPct: 30, actions: [{ kind: 'skill', refId: 0x40 }] },
        },
      },
    });
    const result = sanitizeConfigSkills(config, new Set());
    expect(result.config).toBe(config);
  });
});
