import { describe, it, expect } from 'vitest';

import { CANONICAL_EFFECT_INDICES } from '@shared/constants/effect-labels';
import { MItemDefinition } from '@shared/constants/item-definitions';

describe('CANONICAL_EFFECT_INDICES', () => {
  it('includes gameplay-visible effects (STR, DAMAGE, AC1, HP, etc)', () => {
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.STR)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.DAMAGE)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.AC1)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.HP)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.CRITICAL)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.EVASION)).toBe(true);
  });

  it('includes canonical iteration table effects with strdef labels', () => {
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.CURKILL)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.LTOTKILL)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.HTOTKILL)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.HITRATE)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.INIT1)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.INIT2)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.INIT3)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.INCUBATE)).toBe(true);
    expect(CANONICAL_EFFECT_INDICES.has(MItemDefinition.INCUDELAY)).toBe(true);
  });

  it('has a reasonable count (not empty, not everything)', () => {
    expect(CANONICAL_EFFECT_INDICES.size).toBeGreaterThan(30);
    expect(CANONICAL_EFFECT_INDICES.size).toBeLessThan(60);
  });
});
