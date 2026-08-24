/**
 * Schema tests for the flat interact target (BankRule + InteractTarget `{ npcName, bank? }`).
 * Category is detected at runtime; the persisted target has no `kind` discriminant.
 */

import { describe, it, expect } from 'vitest';
import {
  BankRuleSchema,
  InteractTargetSchema,
  InteractStepSchema,
  BANK_RULE_MAX,
} from '../../../../src/shared/app-config';

const VALID_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const depositItem = { direction: 'deposit', target: 'item', itemId: 1210 } as const;
const depositGold = { direction: 'deposit', target: 'gold', amount: 1 } as const;

describe('BankRuleSchema', () => {
  it('accepts an item rule with itemId', () => {
    expect(BankRuleSchema.safeParse(depositItem).success).toBe(true);
  });

  it('accepts a gold rule with amount', () => {
    expect(
      BankRuleSchema.safeParse({ direction: 'withdraw', target: 'gold', amount: 5000 }).success,
    ).toBe(true);
  });

  it('rejects an item rule missing itemId', () => {
    const r = BankRuleSchema.safeParse({ direction: 'deposit', target: 'item' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/item/i);
  });

  it('rejects a gold rule missing amount', () => {
    const r = BankRuleSchema.safeParse({ direction: 'deposit', target: 'gold' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/quantia/i);
  });

  it('rejects itemId out of range', () => {
    expect(
      BankRuleSchema.safeParse({ direction: 'deposit', target: 'item', itemId: 0 }).success,
    ).toBe(false);
    expect(
      BankRuleSchema.safeParse({ direction: 'deposit', target: 'item', itemId: 0x1964 }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(BankRuleSchema.safeParse({ ...depositItem, extra: 1 }).success).toBe(false);
  });
});

describe('InteractTargetSchema (flat: npcName + optional bank)', () => {
  it('accepts a plain target (no bank)', () => {
    expect(InteractTargetSchema.safeParse({ npcName: 'Portal' }).success).toBe(true);
  });

  it('accepts a bank target with rules', () => {
    expect(
      InteractTargetSchema.safeParse({
        npcName: 'Guarda',
        bank: { rules: [depositItem, depositGold] },
      }).success,
    ).toBe(true);
  });

  it('accepts bank.depositFullStackOnly and defaults it to absent for legacy JSON', () => {
    const withFlag = InteractTargetSchema.safeParse({
      npcName: 'Guarda',
      bank: { rules: [depositItem], depositFullStackOnly: true },
    });
    expect(withFlag.success).toBe(true);
    if (withFlag.success) expect(withFlag.data.bank?.depositFullStackOnly).toBe(true);

    const legacy = InteractTargetSchema.safeParse({
      npcName: 'Guarda',
      bank: { rules: [depositItem] },
    });
    expect(legacy.success).toBe(true);
    if (legacy.success) expect(legacy.data.bank?.depositFullStackOnly).toBeUndefined();
  });

  it('rejects unknown keys inside bank (strict)', () => {
    expect(
      InteractTargetSchema.safeParse({
        npcName: 'Guarda',
        bank: { rules: [depositItem], bogus: 1 },
      }).success,
    ).toBe(false);
  });

  it('accepts an empty rules array (≥1 rule enforced in the UI, not the schema)', () => {
    expect(InteractTargetSchema.safeParse({ npcName: 'Guarda', bank: { rules: [] } }).success).toBe(
      true,
    );
  });

  it('rejects more than BANK_RULE_MAX rules', () => {
    const tooMany = Array.from({ length: BANK_RULE_MAX + 1 }, () => depositItem);
    expect(
      InteractTargetSchema.safeParse({ npcName: 'Guarda', bank: { rules: tooMany } }).success,
    ).toBe(false);
  });

  it('rejects an empty npcName', () => {
    expect(InteractTargetSchema.safeParse({ npcName: '', bank: { rules: [] } }).success).toBe(
      false,
    );
  });

  it('rejects the legacy `kind` discriminant (strict, no retro-compat)', () => {
    expect(InteractTargetSchema.safeParse({ kind: 'npc', npcName: 'Portal' }).success).toBe(false);
    expect(
      InteractTargetSchema.safeParse({ kind: 'bank', npcName: 'Guarda', rules: [depositItem] })
        .success,
    ).toBe(false);
  });

  it('defaults shop.open to dialog for legacy JSON without open', () => {
    const r = InteractTargetSchema.safeParse({
      npcName: 'Smith',
      shop: { rules: [{ itemId: 100, quantity: 1 }] },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shop?.open).toBe('dialog');
  });

  it('accepts shop.open npc', () => {
    const r = InteractTargetSchema.safeParse({
      npcName: 'Smith',
      shop: { rules: [{ itemId: 100, quantity: 1 }], open: 'npc' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shop?.open).toBe('npc');
  });

  it('rejects bank + shop on the same target (single service)', () => {
    expect(
      InteractTargetSchema.safeParse({
        npcName: 'X',
        bank: { rules: [depositGold] },
        shop: { rules: [{ itemId: 1, quantity: 1 }], open: 'dialog' },
      }).success,
    ).toBe(false);
  });
});

describe('InteractStepSchema round-trip', () => {
  it('validates a bank interact step', () => {
    const step = {
      id: VALID_ULID,
      kind: 'interact',
      target: { npcName: 'Guarda Real', bank: { rules: [depositItem, depositGold] } },
    };
    const r = InteractStepSchema.safeParse(step);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(step);
  });

  it('validates a plain NPC step (LAN_A migrated shape)', () => {
    const step = { id: VALID_ULID, kind: 'interact', target: { npcName: 'LAN A' } };
    expect(InteractStepSchema.safeParse(step).success).toBe(true);
  });

  it('rejects the old inner `kind: npc` shape (strict)', () => {
    const step = { id: VALID_ULID, kind: 'interact', target: { kind: 'npc', npcName: 'LAN A' } };
    expect(InteractStepSchema.safeParse(step).success).toBe(false);
  });
});
