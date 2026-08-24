/**
 * Schema tests for AutoDrop (misc.autoDrop): rules + per-rule attribute
 * predicate groups (OR of ANDs on both drop and keep sides).
 */
import { describe, it, expect } from 'vitest';
import { AutoDropSchema } from '../../../../src/shared/app-config';

describe('AutoDropSchema', () => {
  it('accepts a minimal rule with no groups ("qualquer instância")', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [{ itemId: 415, dropGroups: [] }],
      }).success,
    ).toBe(true);
  });

  it('accepts a rule with canonical attr predicates', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [
          {
            itemId: 1234,
            dropGroups: [
              [
                { index: 4, op: '>=', value: 100 }, // HP
                { index: 7, op: '>', value: 10 }, // STR
              ],
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate itemId across rules', () => {
    const r = AutoDropSchema.safeParse({
      enabled: true,
      rules: [
        { itemId: 415, dropGroups: [] },
        { itemId: 415, dropGroups: [] },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [{ itemId: 415, dropGroups: [], extra: 1 }],
      }).success,
    ).toBe(false);
  });

  it('rejects the legacy attrs shape (migrated at load, not by the schema)', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [{ itemId: 415, attrs: [{ index: 4, op: '>=', value: 1 }], dropGroups: [] }],
      }).success,
    ).toBe(false);
  });

  it('rejects attr index > 255', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [{ itemId: 415, dropGroups: [[{ index: 256, op: '>=', value: 1 }]] }],
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid op', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [{ itemId: 415, dropGroups: [[{ index: 4, op: '!=', value: 1 }]] }],
      }).success,
    ).toBe(false);
  });

  it('accepts presence ops (absent/present)', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [
          {
            itemId: 840,
            dropGroups: [
              [{ index: 74, op: '<', value: 21 }],
              [
                { index: 2, op: 'absent', value: 0 },
                { index: 60, op: 'present', value: 0 },
              ],
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts an optional keepGroups veto side', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [
          {
            itemId: 840,
            dropGroups: [[{ index: 74, op: '<', value: 21 }]],
            keepGroups: [[{ index: 74, op: '>=', value: 39 }]],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('still rejects unknown keys inside group entries (strict)', () => {
    expect(
      AutoDropSchema.safeParse({
        enabled: true,
        rules: [
          {
            itemId: 840,
            dropGroups: [],
            keepGroups: [[{ index: 74, op: '>=', value: 39, extra: 1 }]],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
