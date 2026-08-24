import type {
  BankRule,
  ComposeAction,
  InteractTarget,
  ShopOpen,
  ShopRule,
} from '@shared/app-config';
import type { NpcCategory } from '@shared/types';

/**
 * Runtime service for an interact step — derived only from target payloads
 * (`bank` / `compose` / `shop`), never from `npcCategory`.
 * Priority if multiple payloads coexist: shop > bank > compose > bare.
 */
export type InteractService =
  | { kind: 'bank'; rules: BankRule[]; depositFullStackOnly: boolean }
  | { kind: 'compose'; actions: ComposeAction[] }
  | { kind: 'shop'; rules: ShopRule[]; open: ShopOpen }
  | { kind: 'bare' };

export const resolveInteractService = (target: InteractTarget): InteractService => {
  if (target.shop) {
    return {
      kind: 'shop',
      rules: target.shop.rules,
      open: target.shop.open ?? 'dialog',
    };
  }
  if (target.bank)
    return {
      kind: 'bank',
      rules: target.bank.rules,
      depositFullStackOnly: target.bank.depositFullStackOnly ?? false,
    };
  if (target.compose) return { kind: 'compose', actions: target.compose.actions };
  return { kind: 'bare' };
};

/** Display chip from service payload; bare falls back to optional npcCategory. */
export const interactServiceCategory = (target: InteractTarget): NpcCategory | undefined => {
  const s = resolveInteractService(target);
  if (s.kind === 'bare') return target.npcCategory;
  return s.kind;
};

/**
 * Probe-only open order for shop inventory discovery.
 * Default dialog→npc; wire hint `shop` prefers npc→dialog. Not for runtime.
 */
export const probeShopOpenOrder = (wireHint?: NpcCategory): readonly ShopOpen[] =>
  wireHint === 'shop' ? (['npc', 'dialog'] as const) : (['dialog', 'npc'] as const);
