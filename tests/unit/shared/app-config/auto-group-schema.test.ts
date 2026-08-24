/**
 * Schema tests for the Auto Grupo config (misc.autoGroup): enabled + mode +
 * whitelist of player names. Names dedup case-insensitively.
 */

import { describe, it, expect } from 'vitest';
import { AutoGroupSchema, MISC_AUTO_GROUP_MAX_MEMBERS } from '../../../../src/shared/app-config';

const base = { enabled: true, mode: 'leader', whitelist: [{ name: 'Aragorn' }] } as const;

describe('AutoGroupSchema', () => {
  it('accepts a valid leader config', () => {
    expect(AutoGroupSchema.safeParse(base).success).toBe(true);
  });

  it('accepts the accept mode', () => {
    expect(AutoGroupSchema.safeParse({ ...base, mode: 'accept' }).success).toBe(true);
  });

  it('accepts an empty whitelist', () => {
    expect(
      AutoGroupSchema.safeParse({ enabled: false, mode: 'leader', whitelist: [] }).success,
    ).toBe(true);
  });

  it('rejects an unknown mode', () => {
    expect(AutoGroupSchema.safeParse({ ...base, mode: 'both' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(AutoGroupSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it('rejects an empty player name', () => {
    expect(AutoGroupSchema.safeParse({ ...base, whitelist: [{ name: '' }] }).success).toBe(false);
  });

  it('trims whitespace on the name', () => {
    const r = AutoGroupSchema.safeParse({ ...base, whitelist: [{ name: '  Legolas  ' }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.whitelist[0].name).toBe('Legolas');
  });

  it('rejects duplicate names case-insensitively', () => {
    const r = AutoGroupSchema.safeParse({
      ...base,
      whitelist: [{ name: 'Gimli' }, { name: 'gimli' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/whitelist/i);
  });

  it('rejects a whitelist over the max', () => {
    const tooMany = Array.from({ length: MISC_AUTO_GROUP_MAX_MEMBERS + 1 }, (_, i) => ({
      name: `Player${i}`,
    }));
    expect(AutoGroupSchema.safeParse({ ...base, whitelist: tooMany }).success).toBe(false);
  });
});
