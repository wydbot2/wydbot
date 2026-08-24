/**
 * Schema tests for AutoHealingSchema + sub-schemas (actions[] shape).
 */

import { describe, it, expect } from 'vitest';
import {
  AutoHealingSchema,
  AutoHealingMountFeedSchema,
  AutoHealingHpSchema,
  AutoHealingMpSchema,
  AutoHealingDebuffCureSchema,
  HealActionSchema,
  AUTO_HEALING_MAX_ACTIONS,
} from '../../../../src/shared/app-config/v1/sections/auto-healing';
import { MiscSectionSchema } from '../../../../src/shared/app-config/v1/sections/misc';

describe('HealActionSchema', () => {
  it('accepts item actions', () => {
    expect(HealActionSchema.safeParse({ kind: 'item', refId: 2001 }).success).toBe(true);
  });

  it('accepts skill actions', () => {
    expect(HealActionSchema.safeParse({ kind: 'skill', refId: 0x1b }).success).toBe(true);
  });

  it('rejects unknown kind', () => {
    expect(HealActionSchema.safeParse({ kind: 'spell', refId: 1 }).success).toBe(false);
  });

  it('rejects item refId out of range', () => {
    expect(HealActionSchema.safeParse({ kind: 'item', refId: 0 }).success).toBe(false);
    expect(HealActionSchema.safeParse({ kind: 'item', refId: 0x1964 }).success).toBe(false);
  });

  it('rejects skill refId > 255', () => {
    expect(HealActionSchema.safeParse({ kind: 'skill', refId: 256 }).success).toBe(false);
  });
});

describe('AutoHealingMountFeedSchema', () => {
  it('accepts granular threshold + non-empty actions', () => {
    expect(
      AutoHealingMountFeedSchema.safeParse({
        enabled: true,
        thresholdPct: 60,
        actions: [{ kind: 'item', refId: 0x974 }],
      }).success,
    ).toBe(true);
  });

  it('rejects enabled=true without actions', () => {
    const r = AutoHealingMountFeedSchema.safeParse({
      enabled: true,
      thresholdPct: 60,
      actions: [],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/ração/);
  });

  it('rejects thresholds outside [30, 90]', () => {
    expect(
      AutoHealingMountFeedSchema.safeParse({ enabled: true, thresholdPct: 29, actions: [] })
        .success,
    ).toBe(false);
    expect(
      AutoHealingMountFeedSchema.safeParse({ enabled: true, thresholdPct: 91, actions: [] })
        .success,
    ).toBe(false);
  });

  it('caps actions at AUTO_HEALING_MAX_ACTIONS', () => {
    const tooMany = Array.from({ length: AUTO_HEALING_MAX_ACTIONS + 1 }, (_, i) => ({
      kind: 'item' as const,
      refId: 1000 + i,
    }));
    expect(
      AutoHealingMountFeedSchema.safeParse({
        enabled: false,
        thresholdPct: 30,
        actions: tooMany,
      }).success,
    ).toBe(false);
  });
});

describe('AutoHealingHpSchema', () => {
  it('accepts mixed skill + item actions', () => {
    expect(
      AutoHealingHpSchema.safeParse({
        enabled: true,
        thresholdPct: 60,
        actions: [
          { kind: 'skill', refId: 0x1b },
          { kind: 'item', refId: 2001 },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects enabled=true with empty actions', () => {
    const r = AutoHealingHpSchema.safeParse({ enabled: true, thresholdPct: 60, actions: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/skill ou item/);
  });

  it('allows enabled=false with empty actions', () => {
    expect(
      AutoHealingHpSchema.safeParse({ enabled: false, thresholdPct: 60, actions: [] }).success,
    ).toBe(true);
  });
});

describe('AutoHealingMpSchema — item-only', () => {
  it('accepts item actions', () => {
    expect(
      AutoHealingMpSchema.safeParse({
        enabled: true,
        thresholdPct: 30,
        actions: [{ kind: 'item', refId: 2050 }],
      }).success,
    ).toBe(true);
  });

  it('REJECTS skill actions (MP is item-only by canonical spec)', () => {
    expect(
      AutoHealingMpSchema.safeParse({
        enabled: true,
        thresholdPct: 30,
        actions: [{ kind: 'skill', refId: 0x1b }],
      }).success,
    ).toBe(false);
  });

  it('REJECTS mixed list with any skill action', () => {
    expect(
      AutoHealingMpSchema.safeParse({
        enabled: true,
        thresholdPct: 30,
        actions: [
          { kind: 'item', refId: 2050 },
          { kind: 'skill', refId: 0x1b },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires non-empty actions when enabled', () => {
    expect(
      AutoHealingMpSchema.safeParse({ enabled: true, thresholdPct: 30, actions: [] }).success,
    ).toBe(false);
  });
});

describe('AutoHealingDebuffCureSchema', () => {
  it('accepts skill or item actions (no threshold)', () => {
    expect(
      AutoHealingDebuffCureSchema.safeParse({
        enabled: true,
        actions: [
          { kind: 'skill', refId: 0x19 },
          { kind: 'item', refId: 415 },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects enabled=true with empty actions', () => {
    expect(AutoHealingDebuffCureSchema.safeParse({ enabled: true, actions: [] }).success).toBe(
      false,
    );
  });

  it('strict — rejects thresholdPct field (debuff is event-triggered)', () => {
    expect(
      AutoHealingDebuffCureSchema.safeParse({
        enabled: false,
        thresholdPct: 50,
        actions: [],
      }).success,
    ).toBe(false);
  });
});

describe('AutoHealingSchema — master', () => {
  it('accepts a full config with all 4 sub-features', () => {
    expect(
      AutoHealingSchema.safeParse({
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
      }).success,
    ).toBe(true);
  });

  it('accepts minimal config (enabled=false, no sub-features)', () => {
    expect(AutoHealingSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('rejects unknown keys (strict)', () => {
    expect(AutoHealingSchema.safeParse({ enabled: true, unknownExtra: 1 }).success).toBe(false);
  });
});

describe('MiscSectionSchema integration', () => {
  it('parses misc WITHOUT autoHealing (back-compat with LAN_A.json shape)', () => {
    expect(
      MiscSectionSchema.safeParse({
        deathReturn: { enabled: false, mode: 'pause' },
        autoStack: { enabled: false },
      }).success,
    ).toBe(true);
  });

  it('parses misc WITH autoHealing (new shape)', () => {
    expect(
      MiscSectionSchema.safeParse({
        autoHealing: {
          enabled: true,
          hp: {
            enabled: true,
            thresholdPct: 70,
            actions: [{ kind: 'skill', refId: 0x1b }],
          },
        },
      }).success,
    ).toBe(true);
  });
});
