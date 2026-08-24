/**
 * Unit tests for the `stats` projection in `marshalViewItemToScript`.
 *
 * Locks the single-source invariant: every canonical effect index (i.e. every
 * effect that survives the `!e.hidden` filter in `enrichEffect`) must map to
 * a friendly `id` in `STAT_KEY`. If this breaks, the script-API falls back to
 * `effect_<n>` for an effect that the tooltip shows — confusing for macro authors.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ViewItem, ViewItemEffect } from '../../../../src/shared/types/item-types';
import { MItemDefinition } from '../../../../src/shared/constants/item-definitions';
import { CANONICAL_EFFECT_INDICES } from '../../../../src/shared/constants/effect-labels';

// item-db is only consulted for scroll enrichment; we don't need it here.
vi.mock('../../../../src/renderer/lib/item-db', () => ({ getItem: () => undefined }));

import { marshalViewItemToScript } from '../../../../src/renderer/lib/script-item-marshal';

const effect = (
  index: number,
  value = 1,
  overrides: Partial<ViewItemEffect> = {},
): ViewItemEffect => ({
  index,
  value,
  label: `EF_${index}`,
  hidden: !CANONICAL_EFFECT_INDICES.has(index),
  displayText: `${value}`,
  ...overrides,
});

const item = (effects: ViewItemEffect[]): ViewItem =>
  ({ index: 1234, name: 'Test Item', effects }) as unknown as ViewItem;

describe('marshalViewItemToScript — stats projection', () => {
  it('returns no stats for an empty effect list', () => {
    const out = marshalViewItemToScript(item([]), 0, 0);
    expect(out).not.toBeNull();
    expect(out!.stats).toEqual([]);
  });

  it('projects a canonical HP effect to { id: "hp" }', () => {
    const out = marshalViewItemToScript(item([effect(MItemDefinition.HP, 100)]), 0, 0);
    expect(out!.stats).toEqual([{ id: 'hp', label: 'EF_4', value: 100 }]);
  });

  it('projects multiple canonical effects with stable ids', () => {
    const out = marshalViewItemToScript(
      item([
        effect(MItemDefinition.DAMAGE, 2000),
        effect(MItemDefinition.STR, 30),
        effect(MItemDefinition.CRITICAL, 50),
      ]),
      0,
      0,
    );
    const ids = out!.stats.map((s) => s.id);
    expect(ids).toEqual(['damage', 'str', 'critical']);
  });

  it('does NOT project hidden effects (e.g. ABSDAM 89 / ABSAC 90)', () => {
    const out = marshalViewItemToScript(
      item([effect(MItemDefinition.ABSDAM, 5), effect(MItemDefinition.ABSAC, 5)]),
      0,
      0,
    );
    expect(out!.stats).toEqual([]);
  });

  it('does NOT project index 0 (empty effect slot sentinel)', () => {
    const zeroEffect: ViewItemEffect = {
      index: 0,
      value: 0,
      label: '',
      hidden: true,
      displayText: '',
    };
    const out = marshalViewItemToScript(item([zeroEffect]), 0, 0);
    expect(out!.stats).toEqual([]);
  });

  it('projects hardcoded bonuses to their ids (sanc > 8 magic-attack)', () => {
    const out = marshalViewItemToScript(
      item([
        effect(-3, 16, { hidden: false, source: 'hardcoded' }), // HARDCODED_BONUS.MAGIC_ATTACK
      ]),
      0,
      0,
    );
    expect(out!.stats).toEqual([{ id: 'hardcodedMagic', label: 'EF_-3', value: 16 }]);
  });

  it('projects premium-item duration (TIME_BONUS.DURATION = -9)', () => {
    const out = marshalViewItemToScript(
      item([effect(-9, 0, { hidden: false, source: 'hardcoded', label: '3 Dia(s) 5 Horas(s)' })]),
      0,
      0,
    );
    expect(out!.stats).toEqual([{ id: 'duration', label: '3 Dia(s) 5 Horas(s)', value: 0 }]);
  });
});

describe('STAT_KEY — single-source invariant', () => {
  /**
   * Indirectly asserts STAT_KEY covers every canonical effect index. We can't
   * import STAT_KEY directly (it's module-private), so we marshal a synthetic
   * item with every canonical effect and check that none fall back to
   * `effect_<n>`. If any canonical index lacks a friendly id, this test names
   * the offending index in the assertion message.
   */
  it('every canonical effect index has a friendly id (no effect_<n> fallback)', () => {
    const all = [...CANONICAL_EFFECT_INDICES].map((idx) => effect(idx, 1));
    const out = marshalViewItemToScript(item(all), 0, 0);
    const fallbacks = out!.stats.filter((s) => s.id.startsWith('effect_'));
    expect(
      fallbacks,
      `indices without a STAT_KEY entry: ${fallbacks.map((s) => s.id).join(', ')}`,
    ).toEqual([]);
  });
});
