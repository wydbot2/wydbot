import { describe, it, expect } from 'vitest';
import type { BankRule } from '@shared/app-config';
import type { ViewItem } from '@shared/types/item-types';
import {
  STORAGE_SIZE,
  buildBankRules,
  buildBankTarget,
  canSaveBank,
  depositItemIds,
  goldRuleOf,
  isBankFull,
  planBankRule,
  withdrawItemIds,
  type BankDraft,
} from '../../../../src/renderer/lib/bank-rules';

// planBankRule only reads `index`; cast a minimal shape to avoid filling all ViewItem fields.
const bag = (...indices: number[]): ViewItem[] => indices.map((index) => ({ index }) as ViewItem);

// Richer fixture for merge-target tests: index + optional live stack count + refine.
const stack = (index: number, stackCount?: number, refineLevel?: number): ViewItem =>
  ({ index, stackCount, refineLevel }) as ViewItem;

const draft = (over: Partial<BankDraft> = {}): BankDraft => ({
  npcName: 'Banqueiro',
  depositIds: [],
  withdrawIds: [],
  goldDirection: 'deposit',
  goldAmount: 0,
  depositFullStackOnly: false,
  ...over,
});

describe('buildBankRules', () => {
  it('maps deposit item ids to deposit/item rules in order', () => {
    const rules = buildBankRules(draft({ depositIds: [10, 20, 30] }));
    expect(rules).toEqual([
      { direction: 'deposit', target: 'item', itemId: 10 },
      { direction: 'deposit', target: 'item', itemId: 20 },
      { direction: 'deposit', target: 'item', itemId: 30 },
    ]);
  });

  it('omits the gold rule when amount is 0', () => {
    expect(buildBankRules(draft({ goldAmount: 0 }))).toEqual([]);
  });

  it('appends a single gold rule (after the items) when amount ≥ 1', () => {
    const rules = buildBankRules(
      draft({ depositIds: [7], goldDirection: 'withdraw', goldAmount: 5000 }),
    );
    expect(rules).toEqual([
      { direction: 'deposit', target: 'item', itemId: 7 },
      { direction: 'withdraw', target: 'gold', amount: 5000 },
    ]);
  });
});

describe('buildBankTarget', () => {
  it('trims the npc name and nests the rules under bank', () => {
    const target = buildBankTarget(draft({ npcName: '  Guarda  ', depositIds: [1] }));
    expect(target.npcName).toBe('Guarda');
    expect(target.bank?.rules).toHaveLength(1);
  });

  it('omits depositFullStackOnly by default and emits it when enabled', () => {
    expect(buildBankTarget(draft({ depositIds: [1] })).bank?.depositFullStackOnly).toBeUndefined();
    expect(
      buildBankTarget(draft({ depositIds: [1], depositFullStackOnly: true })).bank
        ?.depositFullStackOnly,
    ).toBe(true);
  });
});

describe('canSaveBank', () => {
  it('is false with no rules even if the name is set', () => {
    expect(canSaveBank(draft({ npcName: 'X', depositIds: [], goldAmount: 0 }))).toBe(false);
  });

  it('is false with rules but a blank name', () => {
    expect(canSaveBank(draft({ npcName: '   ', depositIds: [1] }))).toBe(false);
  });

  it('is true with a name and ≥1 rule (item or gold)', () => {
    expect(canSaveBank(draft({ depositIds: [1] }))).toBe(true);
    expect(canSaveBank(draft({ goldAmount: 1 }))).toBe(true);
  });
});

describe('depositItemIds / goldRuleOf (round-trip from persisted rules)', () => {
  const rules: BankRule[] = [
    { direction: 'deposit', target: 'item', itemId: 100 },
    { direction: 'deposit', target: 'item', itemId: 200 },
    { direction: 'withdraw', target: 'gold', amount: 999 },
  ];

  it('extracts deposit item ids in order, ignoring the gold rule', () => {
    expect(depositItemIds(rules)).toEqual([100, 200]);
  });

  it('finds the single gold rule', () => {
    expect(goldRuleOf(rules)).toEqual({ direction: 'withdraw', target: 'gold', amount: 999 });
  });

  it('returns undefined gold when there is no gold rule', () => {
    expect(goldRuleOf([{ direction: 'deposit', target: 'item', itemId: 1 }])).toBeUndefined();
  });
});

describe('isBankFull', () => {
  it('is false for empty/unpopulated storage (no data ⇒ never blocks)', () => {
    expect(isBankFull([])).toBe(false);
  });

  it('is false when storage has at least one empty (index 0) slot', () => {
    const storage = bag(...Array.from({ length: STORAGE_SIZE }, (_, i) => (i === 5 ? 0 : i + 1)));
    expect(isBankFull(storage)).toBe(false);
  });

  it('is true when all 120 slots are occupied', () => {
    const storage = bag(...Array.from({ length: STORAGE_SIZE }, (_, i) => i + 1));
    expect(isBankFull(storage)).toBe(true);
  });

  it('ignores the non-rendered tail (wire MItem[128]): 0..119 full + 120..127 empty ⇒ full', () => {
    const storage = bag(...Array.from({ length: 128 }, (_, i) => (i < STORAGE_SIZE ? i + 1 : 0)));
    expect(isBankFull(storage)).toBe(true);
  });
});

describe('planBankRule', () => {
  it('plans a gold deposit', () => {
    const op = planBankRule({ direction: 'deposit', target: 'gold', amount: 5000 }, [], []);
    expect(op).toEqual({ kind: 'gold', direction: 'deposit', amount: 5000 });
  });

  it('plans a gold withdraw', () => {
    const op = planBankRule({ direction: 'withdraw', target: 'gold', amount: 250 }, [], []);
    expect(op).toEqual({ kind: 'gold', direction: 'withdraw', amount: 250 });
  });

  it('resolves a deposit-item rule to the bag slot, with dstSlot 0 when storage is unpopulated', () => {
    const op = planBankRule(
      { direction: 'deposit', target: 'item', itemId: 415 },
      bag(10, 20, 415, 30), // item 415 at bag slot 2
      [],
    );
    expect(op).toEqual({ kind: 'deposit-item', itemId: 415, srcSlot: 2, dstSlot: 0 });
  });

  it('picks the first FREE storage slot when the item is not stackable (default capOf)', () => {
    const op = planBankRule(
      { direction: 'deposit', target: 'item', itemId: 415 },
      bag(415), // bag slot 0
      bag(11, 22, 0, 33), // storage: first empty at slot 2
    );
    expect(op).toEqual({ kind: 'deposit-item', itemId: 415, srcSlot: 0, dstSlot: 2 });
  });

  it('skips a deposit-item rule when the item is absent from the bag', () => {
    const op = planBankRule(
      { direction: 'deposit', target: 'item', itemId: 415 },
      bag(1, 2, 3),
      [],
    );
    expect(op).toEqual({
      kind: 'skip',
      rule: { direction: 'deposit', target: 'item', itemId: 415 },
      reason: 'item-absent',
    });
  });

  it('skips a deposit when the bank is full (storage at capacity)', () => {
    const full = bag(...Array.from({ length: STORAGE_SIZE }, (_, i) => i + 1));
    const rule: BankRule = { direction: 'deposit', target: 'item', itemId: 415 };
    const op = planBankRule(rule, bag(415), full);
    expect(op).toEqual({ kind: 'skip', rule, reason: 'bank-full' });
  });

  it('resolves a withdraw-item rule to the storage slot, dst = first free bag slot', () => {
    const op = planBankRule(
      { direction: 'withdraw', target: 'item', itemId: 415 },
      bag(7, 0, 8), // bag: first empty at slot 1
      bag(10, 415, 20), // item 415 at storage slot 1
    );
    expect(op).toEqual({ kind: 'withdraw-item', itemId: 415, srcSlot: 1, dstSlot: 1 });
  });

  it('skips a withdraw when the bag is full (no free slot)', () => {
    const fullBag = bag(...Array.from({ length: 60 }, (_, i) => i + 1));
    const rule: BankRule = { direction: 'withdraw', target: 'item', itemId: 415 };
    const op = planBankRule(rule, fullBag, bag(415));
    expect(op).toEqual({ kind: 'skip', rule, reason: 'bag-full' });
  });

  it('skips a withdraw-item rule when the item is absent from storage', () => {
    const rule: BankRule = { direction: 'withdraw', target: 'item', itemId: 415 };
    const op = planBankRule(rule, bag(415), bag(1, 2, 3));
    expect(op).toEqual({ kind: 'skip', rule, reason: 'item-absent' });
  });

  it('skips a malformed gold rule with no amount', () => {
    const rule: BankRule = { direction: 'deposit', target: 'gold' };
    expect(planBankRule(rule, [], [])).toEqual({ kind: 'skip', rule, reason: 'invalid' });
  });
});

describe('planBankRule — stackable deposit merge', () => {
  const STACKABLE = 415;
  const capOf = (id: number): number => (id === STACKABLE ? 120 : 0);
  const depositStackable: BankRule = { direction: 'deposit', target: 'item', itemId: STACKABLE };

  it('merges onto an existing same-item, same-refine partial instead of a free slot', () => {
    const op = planBankRule(
      depositStackable,
      bag(STACKABLE), // src bag slot 0
      [stack(0), stack(STACKABLE, 100), stack(0)], // partial 415 at storage slot 1 (free at 0/2)
      capOf,
    );
    expect(op).toEqual({ kind: 'deposit-item', itemId: STACKABLE, srcSlot: 0, dstSlot: 1 });
  });

  it('targets the FULLEST of multiple partials (anti-fragmentation)', () => {
    const op = planBankRule(
      depositStackable,
      bag(STACKABLE),
      [stack(STACKABLE, 50), stack(STACKABLE, 100)],
      capOf,
    );
    expect(op).toMatchObject({ kind: 'deposit-item', dstSlot: 1 });
  });

  it('skips a FULL same-item stack and falls back to a free slot', () => {
    const op = planBankRule(
      depositStackable,
      bag(STACKABLE),
      [stack(STACKABLE, 120), stack(0)], // full stack at slot 0, free at slot 1
      capOf,
    );
    expect(op).toMatchObject({ kind: 'deposit-item', dstSlot: 1 });
  });

  it('does NOT merge onto a differing-refine stack', () => {
    const op = planBankRule(
      depositStackable,
      bag(STACKABLE), // refine 0
      [stack(STACKABLE, 100, 1), stack(0)], // +1 stack at slot 0
      capOf,
    );
    expect(op).toMatchObject({ kind: 'deposit-item', dstSlot: 1 });
  });

  it('merges into a partial stack even when the bank is otherwise full', () => {
    const full = Array.from({ length: STORAGE_SIZE }, (_, i) =>
      i === 5 ? stack(STACKABLE, 100) : stack(i + 1),
    );
    const op = planBankRule(depositStackable, bag(STACKABLE), full, capOf);
    expect(op).toEqual({ kind: 'deposit-item', itemId: STACKABLE, srcSlot: 0, dstSlot: 5 });
  });

  it('uses a free slot for a non-stackable item (cap 0), ignoring a same-item stack', () => {
    const NONSTACK = 999;
    const op = planBankRule(
      { direction: 'deposit', target: 'item', itemId: NONSTACK },
      bag(NONSTACK),
      [stack(NONSTACK, 50), stack(0)],
      capOf,
    );
    expect(op).toMatchObject({ kind: 'deposit-item', dstSlot: 1 });
  });

  it('keeps no-merge behavior when capOf is omitted (default)', () => {
    const op = planBankRule(depositStackable, bag(STACKABLE), [stack(STACKABLE, 100), stack(0)]);
    expect(op).toMatchObject({ kind: 'deposit-item', dstSlot: 1 });
  });
});

describe('planBankRule — depositFullStackOnly', () => {
  const STACKABLE = 413; // Poeira de Lac — cap 120
  const capOf = (id: number): number => (id === STACKABLE ? 120 : 0);
  const depositStackable: BankRule = { direction: 'deposit', target: 'item', itemId: STACKABLE };

  it('deposits a full stack (stackCount >= cap)', () => {
    const op = planBankRule(depositStackable, [stack(STACKABLE, 120)], [], capOf, true);
    expect(op).toEqual({ kind: 'deposit-item', itemId: STACKABLE, srcSlot: 0, dstSlot: 0 });
  });

  it('skips silently when only partial stacks exist (no-full-stack)', () => {
    const op = planBankRule(depositStackable, [stack(STACKABLE, 100)], [], capOf, true);
    expect(op).toEqual({ kind: 'skip', rule: depositStackable, reason: 'no-full-stack' });
  });

  it('picks the full stack and leaves partials for later rounds', () => {
    const op = planBankRule(
      depositStackable,
      [stack(STACKABLE, 100), stack(STACKABLE, 120), stack(STACKABLE, 10)],
      [],
      capOf,
      true,
    );
    expect(op).toMatchObject({ kind: 'deposit-item', srcSlot: 1 });
  });

  it('treats stackCount undefined (=1) as not full', () => {
    const op = planBankRule(depositStackable, [stack(STACKABLE)], [], capOf, true);
    expect(op).toEqual({ kind: 'skip', rule: depositStackable, reason: 'no-full-stack' });
  });

  it('reports item-absent (not no-full-stack) when the item is missing entirely', () => {
    const op = planBankRule(depositStackable, [stack(1, 50)], [], capOf, true);
    expect(op).toEqual({ kind: 'skip', rule: depositStackable, reason: 'item-absent' });
  });

  it('deposits non-stackable items (cap 0) normally even with the flag on', () => {
    const NONSTACK = 999;
    const rule: BankRule = { direction: 'deposit', target: 'item', itemId: NONSTACK };
    const op = planBankRule(rule, [stack(NONSTACK)], [], capOf, true);
    expect(op).toEqual({ kind: 'deposit-item', itemId: NONSTACK, srcSlot: 0, dstSlot: 0 });
  });

  it('still prefers merging a full stack onto an existing storage partial', () => {
    const op = planBankRule(
      depositStackable,
      [stack(STACKABLE, 120)],
      [stack(STACKABLE, 60), stack(0)],
      capOf,
      true,
    );
    expect(op).toMatchObject({ kind: 'deposit-item', dstSlot: 0 });
  });

  it('ignores the flag for withdraw rules', () => {
    const rule: BankRule = { direction: 'withdraw', target: 'item', itemId: STACKABLE };
    const op = planBankRule(rule, [], [stack(STACKABLE, 37)], capOf, true);
    expect(op).toMatchObject({ kind: 'withdraw-item', srcSlot: 0 });
  });

  it('keeps depositing partials when the flag is off', () => {
    const op = planBankRule(depositStackable, [stack(STACKABLE, 100)], [], capOf, false);
    expect(op).toMatchObject({ kind: 'deposit-item', srcSlot: 0 });
  });
});

describe('withdrawItemIds', () => {
  it('extracts only the withdraw-item ids', () => {
    const rules: BankRule[] = [
      { direction: 'deposit', target: 'item', itemId: 1 },
      { direction: 'withdraw', target: 'item', itemId: 2 },
      { direction: 'withdraw', target: 'item', itemId: 3 },
      { direction: 'withdraw', target: 'gold', amount: 10 },
    ];
    expect(withdrawItemIds(rules)).toEqual([2, 3]);
  });
});
