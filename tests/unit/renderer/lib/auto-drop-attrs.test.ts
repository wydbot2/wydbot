/**
 * Single-source invariants for the auto-drop rule editor.
 *
 * The dropdown exposes only effects that the inventory tooltip also shows.
 * If this breaks, a user can craft a rule against an attribute the tooltip
 * hides — making the threshold impossible to verify visually.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_DROP_ATTR_INDEXES,
  attrShowsPercent,
} from '../../../../src/renderer/lib/auto-drop-attrs';
import { CANONICAL_EFFECT_INDICES } from '../../../../src/shared/constants/effect-labels';
import { MItemDefinition } from '../../../../src/shared/constants/item-definitions';

describe('AUTO_DROP_ATTR_INDEXES — single-source invariant', () => {
  it('every dropdown index is canonical (tooltip-visible)', () => {
    for (const idx of AUTO_DROP_ATTR_INDEXES) {
      expect(CANONICAL_EFFECT_INDICES.has(idx), `index ${idx} is not canonical`).toBe(true);
    }
  });

  it('does NOT include ABSDAM (89) or ABSAC (90) — non-canonical effects', () => {
    expect(AUTO_DROP_ATTR_INDEXES).not.toContain(89);
    expect(AUTO_DROP_ATTR_INDEXES).not.toContain(90);
  });
});

describe('attrShowsPercent', () => {
  it('is true for ATTSPEED and false for SPECIALALL / DAMAGE', () => {
    expect(attrShowsPercent(MItemDefinition.ATTSPEED)).toBe(true);
    expect(attrShowsPercent(MItemDefinition.SPECIALALL)).toBe(false);
    expect(attrShowsPercent(MItemDefinition.DAMAGE)).toBe(false);
  });
});
