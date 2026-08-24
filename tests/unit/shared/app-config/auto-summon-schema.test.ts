/**
 * Schema tests for the Auto Summon config (misc.autoSummon): enabled + a
 * single nullable skill id (one active summon at a time — never a list).
 */

import { describe, it, expect } from 'vitest';
import { AutoSummonSchema } from '../../../../src/shared/app-config';

describe('AutoSummonSchema', () => {
  it('accepts a chosen summon', () => {
    expect(AutoSummonSchema.safeParse({ enabled: true, skill: 0x38 }).success).toBe(true);
  });

  it('accepts skill: null (none chosen)', () => {
    expect(AutoSummonSchema.safeParse({ enabled: false, skill: null }).success).toBe(true);
  });

  it('rejects a missing skill key', () => {
    expect(AutoSummonSchema.safeParse({ enabled: true }).success).toBe(false);
  });

  it('rejects out-of-range ids', () => {
    expect(AutoSummonSchema.safeParse({ enabled: true, skill: 256 }).success).toBe(false);
    expect(AutoSummonSchema.safeParse({ enabled: true, skill: -1 }).success).toBe(false);
  });

  it('rejects a fractional id', () => {
    expect(AutoSummonSchema.safeParse({ enabled: true, skill: 56.5 }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(AutoSummonSchema.safeParse({ enabled: true, skill: 0x38, extra: 1 }).success).toBe(
      false,
    );
  });

  it('rejects a skills array (single pick, not a list)', () => {
    expect(AutoSummonSchema.safeParse({ enabled: true, skills: [0x38] }).success).toBe(false);
  });
});
