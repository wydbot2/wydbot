import { describe, expect, it } from 'vitest';
import type { AppConfigV1 } from '@shared/app-config';
import {
  autoDropResyncKey,
  isAutoBuffAmbientEnabled,
  isAutoDropEnabled,
  isAutoGroupEnabled,
  isAutoStackEnabled,
  isAutoSummonAmbientEnabled,
  isDeathRespawnEnabled,
  isMagicalAttackAmbientEnabled,
  isPhysicalAttackAmbientEnabled,
} from '../../../../src/renderer/lib/ambient-module-flags';

const base = (): AppConfigV1 => ({ version: 1, name: 't' });

describe('ambient-module-flags', () => {
  it('death-respawn: enabled flag or non-continue mode', () => {
    expect(isDeathRespawnEnabled(base())).toBe(false);
    expect(
      isDeathRespawnEnabled({
        ...base(),
        misc: { deathReturn: { enabled: true, mode: 'continue' } },
      }),
    ).toBe(true);
    expect(
      isDeathRespawnEnabled({
        ...base(),
        misc: { deathReturn: { enabled: false, mode: 'pause' } },
      }),
    ).toBe(true);
  });

  it('attack ambients follow mode + monsters', () => {
    const withMobs = {
      ...base(),
      attack: {
        enabled: true,
        mode: 'physical' as const,
        monsters: [{ name: 'x', id: 1 }],
      },
    };
    expect(isPhysicalAttackAmbientEnabled(withMobs)).toBe(true);
    expect(isMagicalAttackAmbientEnabled(withMobs)).toBe(false);
    expect(
      isMagicalAttackAmbientEnabled({
        ...withMobs,
        attack: { ...withMobs.attack, mode: 'magical' },
      }),
    ).toBe(true);
  });

  it('misc toggles', () => {
    expect(isAutoStackEnabled(base())).toBe(false);
    expect(isAutoStackEnabled({ ...base(), misc: { autoStack: { enabled: true } } })).toBe(true);
    expect(
      isAutoGroupEnabled({
        ...base(),
        misc: { autoGroup: { enabled: true, mode: 'accept', whitelist: [] } },
      }),
    ).toBe(true);
    expect(isAutoDropEnabled({ ...base(), misc: { autoDrop: { enabled: true, rules: [] } } })).toBe(
      true,
    );
    expect(
      isAutoBuffAmbientEnabled({
        ...base(),
        misc: { autoBuff: { enabled: true, skills: [1] } },
      }),
    ).toBe(true);
    expect(
      isAutoSummonAmbientEnabled({
        ...base(),
        misc: { autoSummon: { enabled: true, skill: 2 } },
      }),
    ).toBe(true);
  });

  it('autoDropResyncKey is null when disabled, hash when enabled', () => {
    expect(autoDropResyncKey(base(), 'abc')).toBe(null);
    expect(
      autoDropResyncKey({ ...base(), misc: { autoDrop: { enabled: true, rules: [] } } }, 'abc'),
    ).toBe('abc');
  });
});
