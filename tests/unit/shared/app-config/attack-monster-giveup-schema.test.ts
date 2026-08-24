/**
 * Schema tests for the per-monster give-up override (attack.monsters[].giveUpTimeoutSec):
 * an optional [15, 120]s timeout that wins over the global attack.giveUp rule.
 * Absent = inherits the default — legacy `{ name }` entries must stay valid.
 */

import { describe, it, expect } from 'vitest';
import { MonsterTargetSchema } from '../../../../src/shared/app-config';

describe('MonsterTargetSchema — giveUpTimeoutSec', () => {
  it('accepts a legacy entry without the override (sparse-save)', () => {
    expect(MonsterTargetSchema.safeParse({ name: 'Lobo' }).success).toBe(true);
  });

  it('accepts an override inside [15, 120]', () => {
    expect(MonsterTargetSchema.safeParse({ name: 'Lobo', giveUpTimeoutSec: 45 }).success).toBe(
      true,
    );
  });

  it('accepts the boundary values 15 and 120', () => {
    expect(MonsterTargetSchema.safeParse({ name: 'Lobo', giveUpTimeoutSec: 15 }).success).toBe(
      true,
    );
    expect(MonsterTargetSchema.safeParse({ name: 'Lobo', giveUpTimeoutSec: 120 }).success).toBe(
      true,
    );
  });

  it('rejects out-of-range overrides', () => {
    expect(MonsterTargetSchema.safeParse({ name: 'Lobo', giveUpTimeoutSec: 14 }).success).toBe(
      false,
    );
    expect(MonsterTargetSchema.safeParse({ name: 'Lobo', giveUpTimeoutSec: 121 }).success).toBe(
      false,
    );
  });

  it('rejects a fractional override', () => {
    expect(MonsterTargetSchema.safeParse({ name: 'Lobo', giveUpTimeoutSec: 30.5 }).success).toBe(
      false,
    );
  });

  it('rejects null — clearing the override omits the key instead', () => {
    expect(MonsterTargetSchema.safeParse({ name: 'Lobo', giveUpTimeoutSec: null }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      MonsterTargetSchema.safeParse({ name: 'Lobo', giveUpTimeoutSec: 30, extra: 1 }).success,
    ).toBe(false);
  });
});
