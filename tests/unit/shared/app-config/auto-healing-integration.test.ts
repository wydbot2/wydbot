/**
 * Integration tests for `AutoHealingSchema` nested inside `AppConfigV1Schema`
 * (actions[] shape).
 */

import { describe, it, expect } from 'vitest';
import { AppConfigV1Schema } from '../../../../src/shared/app-config/v1/config';

const baseConfig = {
  version: 1 as const,
  name: 'integration-test',
};

describe('AppConfigV1Schema + autoHealing nesting (variant A)', () => {
  it('parses a root config with autoHealing fully populated', () => {
    const r = AppConfigV1Schema.safeParse({
      ...baseConfig,
      misc: {
        autoHealing: {
          enabled: true,
          mountFeed: {
            enabled: true,
            thresholdPct: 60,
            actions: [{ kind: 'item', refId: 0x974 }],
          },
          hp: {
            enabled: true,
            thresholdPct: 50,
            actions: [
              { kind: 'skill', refId: 0x1b },
              { kind: 'item', refId: 2001 },
            ],
          },
          mp: {
            enabled: true,
            thresholdPct: 30,
            actions: [{ kind: 'item', refId: 2050 }],
          },
          debuffCure: {
            enabled: true,
            actions: [
              { kind: 'skill', refId: 0x19 },
              { kind: 'item', refId: 415 },
            ],
          },
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it('round-trips through JSON.stringify → parse', () => {
    const original = {
      ...baseConfig,
      misc: {
        autoHealing: {
          enabled: true,
          hp: {
            enabled: true,
            thresholdPct: 70,
            actions: [{ kind: 'skill', refId: 0x1b }],
          },
        },
      },
    };
    const serialized = JSON.parse(JSON.stringify(original)) as unknown;
    const r = AppConfigV1Schema.safeParse(serialized);
    expect(r.success).toBe(true);
    if (r.success) {
      const action = r.data.misc?.autoHealing?.hp?.actions[0];
      expect(action).toEqual({ kind: 'skill', refId: 0x1b });
    }
  });

  it('parses misc configs WITHOUT autoHealing (LAN_A.json today)', () => {
    expect(
      AppConfigV1Schema.safeParse({
        ...baseConfig,
        misc: { autoStack: { enabled: false } },
      }).success,
    ).toBe(true);
  });

  it('rejects unknown nested keys in autoHealing.mountFeed', () => {
    expect(
      AppConfigV1Schema.safeParse({
        ...baseConfig,
        misc: {
          autoHealing: {
            enabled: true,
            mountFeed: { enabled: true, thresholdPct: 60, actions: [], extraKey: 1 },
          },
        },
      }).success,
    ).toBe(false);
  });

  it('rejects misc.autoHealing.mp with a kind:skill action', () => {
    expect(
      AppConfigV1Schema.safeParse({
        ...baseConfig,
        misc: {
          autoHealing: {
            enabled: true,
            mp: {
              enabled: true,
              thresholdPct: 30,
              actions: [{ kind: 'skill', refId: 0x1b }],
            },
          },
        },
      }).success,
    ).toBe(false);
  });

  it('preserves sub-configs when master enabled=false', () => {
    const cfg = {
      ...baseConfig,
      misc: {
        autoHealing: {
          enabled: false,
          hp: {
            enabled: true,
            thresholdPct: 75,
            actions: [{ kind: 'skill', refId: 0x1b }],
          },
        },
      },
    };
    const r = AppConfigV1Schema.safeParse(cfg);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.misc?.autoHealing?.enabled).toBe(false);
      expect(r.data.misc?.autoHealing?.hp?.actions).toHaveLength(1);
      expect(r.data.misc?.autoHealing?.hp?.thresholdPct).toBe(75);
    }
  });
});
