/**
 * Schema tests for the follow step (`{ kind: 'follow', target: { npcName } }`).
 * Follow only carries the NPC name — no category, no bank/compose, no capability
 * gate. The schema is `.strict()`, so any extra key is rejected.
 */

import { describe, it, expect } from 'vitest';
import {
  FollowTargetSchema,
  FollowStepSchema,
  MacroStepSchema,
} from '../../../../src/shared/app-config';

const VALID_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('FollowTargetSchema', () => {
  it('accepts a target with just an npcName', () => {
    expect(FollowTargetSchema.safeParse({ npcName: 'Guarda Kefra' }).success).toBe(true);
  });

  it('rejects an empty npcName', () => {
    expect(FollowTargetSchema.safeParse({ npcName: '' }).success).toBe(false);
  });

  it('rejects extra keys (strict) — no category, bank, or compose on follow', () => {
    expect(FollowTargetSchema.safeParse({ npcName: 'Guarda', npcCategory: 'bank' }).success).toBe(
      false,
    );
    expect(FollowTargetSchema.safeParse({ npcName: 'Guarda', bank: { rules: [] } }).success).toBe(
      false,
    );
  });
});

describe('FollowStepSchema round-trip', () => {
  it('validates a follow step', () => {
    const step = { id: VALID_ULID, kind: 'follow', target: { npcName: 'Mercador' } };
    const r = FollowStepSchema.safeParse(step);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(step);
  });

  it('rejects a missing target', () => {
    expect(FollowStepSchema.safeParse({ id: VALID_ULID, kind: 'follow' }).success).toBe(false);
  });

  it('rejects extra keys on the step (strict)', () => {
    const step = { id: VALID_ULID, kind: 'follow', target: { npcName: 'X' }, mode: 'exact' };
    expect(FollowStepSchema.safeParse(step).success).toBe(false);
  });
});

describe('MacroStepSchema discriminated union', () => {
  it('routes kind:follow to the follow variant', () => {
    const step = { id: VALID_ULID, kind: 'follow', target: { npcName: 'Portal' } };
    expect(MacroStepSchema.safeParse(step).success).toBe(true);
  });

  it('does not accept interact-only fields under a follow step', () => {
    const step = {
      id: VALID_ULID,
      kind: 'follow',
      target: { npcName: 'Guarda', bank: { rules: [] } },
    };
    expect(MacroStepSchema.safeParse(step).success).toBe(false);
  });
});
