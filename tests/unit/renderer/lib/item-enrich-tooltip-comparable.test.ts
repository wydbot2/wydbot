/**
 * Tooltip-comparable effect values (auto-drop thresholds must match inventory tooltip).
 */
import { describe, it, expect } from 'vitest';
import {
  effectTooltipComparable,
  getEffectDisplayFormat,
} from '../../../../src/renderer/lib/item-enrich';
import { MItemDefinition } from '../../../../src/shared/constants/item-definitions';

describe('effectTooltipComparable', () => {
  it('divides percent-format effects by 10 (ATTSPEED 110 → 11)', () => {
    expect(effectTooltipComparable(MItemDefinition.ATTSPEED, 110)).toBe(11);
    expect(effectTooltipComparable(MItemDefinition.ATTSPEED, 0)).toBe(0);
    expect(effectTooltipComparable(MItemDefinition.CRITICAL, 50)).toBe(5);
  });

  it('leaves plain effects unchanged (SPECIALALL, DAMAGE)', () => {
    expect(effectTooltipComparable(MItemDefinition.SPECIALALL, 9)).toBe(9);
    expect(effectTooltipComparable(MItemDefinition.DAMAGE, 283)).toBe(283);
  });

  it('leaves plainpercent / hpadd unchanged (already N% on tooltip)', () => {
    expect(effectTooltipComparable(MItemDefinition.MAGIC, 12)).toBe(12);
    expect(effectTooltipComparable(MItemDefinition.HPADD, 40)).toBe(40);
  });

  it('returns raw value for unknown effect indexes', () => {
    expect(effectTooltipComparable(999, 42)).toBe(42);
  });
});

describe('getEffectDisplayFormat', () => {
  it('reports percent for ATTSPEED and plain for SPECIALALL', () => {
    expect(getEffectDisplayFormat(MItemDefinition.ATTSPEED)).toBe('percent');
    expect(getEffectDisplayFormat(MItemDefinition.SPECIALALL)).toBe('plain');
  });
});
