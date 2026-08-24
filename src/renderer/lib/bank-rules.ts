import type { BankRule, InteractTarget } from '@shared/app-config';
import type { ViewItem } from '@shared/types/item-types';

/**
 * Pure helpers for the bank rules array <-> editor-draft mapping.
 * Kept out of the component so the assembly logic is unit-testable.
 */

/** Item ids of the deposit-item rules, in order. */
export const depositItemIds = (rules: BankRule[]): number[] =>
  rules
    .filter((r) => r.target === 'item' && r.direction === 'deposit' && r.itemId !== undefined)
    .map((r) => r.itemId as number);

/** Item ids of the withdraw-item rules, in order. */
export const withdrawItemIds = (rules: BankRule[]): number[] =>
  rules
    .filter((r) => r.target === 'item' && r.direction === 'withdraw' && r.itemId !== undefined)
    .map((r) => r.itemId as number);

/** The single gold rule, if present. */
export const goldRuleOf = (rules: BankRule[]): BankRule | undefined =>
  rules.find((r) => r.target === 'gold');

export interface BankDraft {
  npcName: string;
  depositIds: number[];
  withdrawIds: number[];
  goldDirection: 'deposit' | 'withdraw';
  /** 0 = no gold rule. */
  goldAmount: number;
  /** Deposit only full stacks of stackable items (non-stackables deposit normally). */
  depositFullStackOnly: boolean;
}

/** Assembles the persisted rules array: deposit items, withdraw items, optional gold last. */
export const buildBankRules = (draft: BankDraft): BankRule[] => [
  ...draft.depositIds.map((id) => ({
    direction: 'deposit' as const,
    target: 'item' as const,
    itemId: id,
  })),
  ...draft.withdrawIds.map((id) => ({
    direction: 'withdraw' as const,
    target: 'item' as const,
    itemId: id,
  })),
  ...(draft.goldAmount >= 1
    ? [{ direction: draft.goldDirection, target: 'gold' as const, amount: draft.goldAmount }]
    : []),
];

export const buildBankTarget = (draft: BankDraft): InteractTarget => ({
  npcName: draft.npcName.trim(),
  npcCategory: 'bank',
  bank: {
    rules: buildBankRules(draft),
    ...(draft.depositFullStackOnly ? { depositFullStackOnly: true } : {}),
  },
});

/** Valid to save iff it has a banker name and ≥1 rule. */
export const canSaveBank = (draft: BankDraft): boolean =>
  draft.npcName.trim().length > 0 && buildBankRules(draft).length > 0;

/** Bank storage capacity: 3 pages × 40 (wire idx = page*40 + slot — divisor 40, not 64). */
export const STORAGE_SIZE = 120;

/**
 * True only when storage is *known* full: the 120 usable slots are all occupied.
 * The wire delivers `MItem[128]` (slots 120..127 are addressable but never rendered),
 * so only the first `STORAGE_SIZE` count. Empty/unpopulated storage ⇒ false.
 */
export const isBankFull = (storage: ViewItem[]): boolean =>
  storage.length >= STORAGE_SIZE && storage.slice(0, STORAGE_SIZE).every((it) => it.index !== 0);

/** First empty (`index===0`) slot within the first `limit` entries, or -1. */
const firstFreeSlot = (slots: ViewItem[], limit: number): number =>
  slots.slice(0, limit).findIndex((it) => it.index === 0);

/** Max usable bag slots (60 = 0x3C); the deposit's free-slot search bound. */
export const BAG_SIZE = 60;

/**
 * Fullest usable storage slot holding `itemId` at `refine` with room (`stackCount < cap`),
 * or -1. The server consolidates a same-item, same-refine move into the target stack
 * (summing; overflow stays in the source), so a deposit aimed here merges instead of needing
 * a free slot. Picks the fullest partial to minimise leftover fragments.
 */
const fullestMergeSlot = (
  storage: ViewItem[],
  itemId: number,
  refine: number,
  cap: number,
): number => {
  let best = -1;
  let bestCount = -1;
  storage.slice(0, STORAGE_SIZE).forEach((it, slot) => {
    if (it.index !== itemId || (it.refineLevel ?? 0) !== refine) return;
    const count = it.stackCount ?? 1;
    if (count < cap && count > bestCount) {
      bestCount = count;
      best = slot;
    }
  });
  return best;
};

/**
 * The concrete operation a rule resolves to against the live bag + storage snapshots.
 * Item ops carry the resolved `dstSlot`. For a non-stackable item it is a free slot; for a
 * stackable it may be an OCCUPIED same-item, same-refine stack — the server consolidates
 * identical stacks (summing; overflow stays in the source) rather than swapping. See
 * packet-builders.ts `buildItemMovePacket`.
 */
export type BankOp =
  | { kind: 'gold'; direction: 'deposit' | 'withdraw'; amount: number }
  | { kind: 'deposit-item'; itemId: number; srcSlot: number; dstSlot: number }
  | { kind: 'withdraw-item'; itemId: number; srcSlot: number; dstSlot: number }
  | {
      kind: 'skip';
      rule: BankRule;
      reason: 'item-absent' | 'invalid' | 'bank-full' | 'bag-full' | 'no-full-stack';
    };

/**
 * Pure decision: what should `rule` do, given the current bag + storage? Slot lookup
 * uses `ViewItem.index` (the item id — NOT `.id`). The effectful runner executes the result.
 * `capOf` returns the per-item manual-stack cap (0 = not stackable); injected so the planner
 * stays pure/testable. A stackable deposit targets an existing same-item stack (see
 * {@link fullestMergeSlot}), else the first free slot. `dstSlot` falls back to 0 when the
 * destination snapshot is unpopulated — best-effort until the inbound echo lands.
 * `fullStackOnly` restricts item deposits to slots whose stack is at the per-item cap
 * (`stackCount >= cap`); non-stackables (cap 0) deposit normally. A stackable with no
 * full stack skips with `no-full-stack`.
 */
export const planBankRule = (
  rule: BankRule,
  bag: ViewItem[],
  storage: ViewItem[],
  capOf: (itemId: number) => number = () => 0,
  fullStackOnly = false,
): BankOp => {
  if (rule.target === 'gold') {
    if (rule.amount === undefined) return { kind: 'skip', rule, reason: 'invalid' };
    return { kind: 'gold', direction: rule.direction, amount: rule.amount };
  }
  if (rule.itemId === undefined) return { kind: 'skip', rule, reason: 'invalid' };
  if (rule.direction === 'withdraw') {
    const srcSlot = storage.findIndex((it) => it.index === rule.itemId);
    if (srcSlot < 0) return { kind: 'skip', rule, reason: 'item-absent' };
    const free = firstFreeSlot(bag, BAG_SIZE);
    if (bag.length > 0 && free < 0) return { kind: 'skip', rule, reason: 'bag-full' };
    return { kind: 'withdraw-item', itemId: rule.itemId, srcSlot, dstSlot: Math.max(free, 0) };
  }
  const cap = capOf(rule.itemId);
  const srcSlot =
    fullStackOnly && cap > 0
      ? bag.findIndex((it) => it.index === rule.itemId && (it.stackCount ?? 1) >= cap)
      : bag.findIndex((it) => it.index === rule.itemId);
  if (srcSlot < 0) {
    const hasItem = bag.some((it) => it.index === rule.itemId);
    return {
      kind: 'skip',
      rule,
      reason: hasItem && fullStackOnly && cap > 0 ? 'no-full-stack' : 'item-absent',
    };
  }
  // Stackable: prefer merging onto an existing same-item/refine stack (no new slot consumed).
  if (cap > 0) {
    const refine = bag[srcSlot]?.refineLevel ?? 0;
    const mergeSlot = fullestMergeSlot(storage, rule.itemId, refine, cap);
    if (mergeSlot >= 0) {
      return { kind: 'deposit-item', itemId: rule.itemId, srcSlot, dstSlot: mergeSlot };
    }
  }
  if (isBankFull(storage)) return { kind: 'skip', rule, reason: 'bank-full' };
  const free = firstFreeSlot(storage, STORAGE_SIZE);
  return { kind: 'deposit-item', itemId: rule.itemId, srcSlot, dstSlot: Math.max(free, 0) };
};
