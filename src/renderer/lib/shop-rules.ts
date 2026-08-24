import type { ShopOpen, ShopRule, InteractTarget } from '@shared/app-config';
import type { IpcShopItem } from '@shared/ipc/ipc-api';
import type { ViewItem } from '@shared/types/item-types';
import { MAXL_INVENTORY } from '@shared/constants/game-basics';

/**
 * Pure shop draft/target helpers + buy resolution (unit-testable, no React).
 * Panel slot from live 0x17C is the linear index 0..26; wire encode for 0x379
 * lives in `encodeShopWireSlot` / `buildShopBuyPacket`.
 */

export interface ShopDraft {
  npcName: string;
  rules: ShopRule[];
  /** Open path proven by probe (or default for legacy). */
  open: ShopOpen;
}

export const buildShopTarget = (draft: ShopDraft): InteractTarget => ({
  npcName: draft.npcName.trim(),
  shop: { rules: draft.rules, open: draft.open },
});

/** Valid to save iff it has an NPC name and at least one rule. */
export const canSaveShop = (draft: ShopDraft): boolean =>
  draft.npcName.trim().length > 0 && draft.rules.length > 0;

export type ShopBuyOp =
  | { kind: 'buy'; slotIndex: number; itemId: number }
  | { kind: 'skip'; reason: 'item-not-in-shop' };

/** Resolve buy rule → linear shop `slotIndex` from live 0x17C items. */
export const resolveShopBuy = (rule: ShopRule, shopItems: readonly IpcShopItem[]): ShopBuyOp => {
  const found = shopItems.find((it) => it.itemId === rule.itemId);
  if (!found) return { kind: 'skip', reason: 'item-not-in-shop' };
  return { kind: 'buy', slotIndex: found.slotIndex, itemId: rule.itemId };
};

/**
 * @returns 0..MAXL_INVENTORY-1, or -1 if full
 */
export const findFreeBagSlot = (inventory: readonly ViewItem[]): number => {
  const n = Math.min(inventory.length, MAXL_INVENTORY);
  for (let i = 0; i < n; i++) {
    if ((inventory[i]?.index ?? 0) === 0) return i;
  }
  return -1;
};
