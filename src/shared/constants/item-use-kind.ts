/**
 * Item use-kind classifier — the SINGLE source of truth for "what happens when
 * this item is used". Mirrors the canonical right-click dispatcher
 * for the complete branch map and the
 * per-category item histogram.
 *
 * Decision inputs are exactly what the game reads: the item id, the
 * ItemList `itemClass` byte (+0x98) and the `VOLATILE` effect slot (idx 0x26).
 * Everything is derivable from the bundled item-db — no per-item hardcode beyond
 * the game's own hardcoded gates (each set below cites its source).
 *
 * Consumers: script-item marshal (attaches `use()` / `scroll` / `useKind`) and
 * the main-side scroll arm validation. Do NOT classify items anywhere else.
 */

import { MItemDefinition } from './item-definitions';
import { HUNT_SCROLL_CATALOG } from './hunt-scroll-catalog';

/**
 * - `'channel'` — `0x3AE` arm → ~5 s → `0x373` with `+0x20=0` (return/portal scrolls)
 * - `'hud'`     — opens a client HUD (refine/option/fireworks/coupon); no plain use
 * - `'equip'`   — falls to the equip/split `0x376` path (not usable)
 * - `'blocked'` — canonical hard-block / explicit exclusion; silent no-op
 */
export type ItemUseKind = 'direct' | 'channel' | 'menu' | 'popup' | 'hud' | 'equip' | 'blocked';

/** Minimal item shape `itemUseKind` needs (matches item-db `Item`). */
export interface UseKindInput {
  readonly id: number;
  readonly itemClass: number;
  readonly effectSlots: ReadonlyArray<{ readonly idx: number; readonly value: number }>;
}

export const GIFT_BOX_ITEM_CLASS = 0x3d;

/**
 * singles `1,6,7,8,0xa,0xc,0xf,0x12,0x1e,0x8c,0xaa,0xab,0xac,0xad,0xae,0xaf,0xb0,0xb1,0xb2,0xbc,0xbd,0xbf,0xc0,0xc1,0xc2,0xc5,0xc6,0xc8,0xc9,0xca,0xcb,0xcc,0xcd,0xce,0xd0,0xd2,0xf2`
 * + ranges `0x13–0x1c`, `0x1f–0x24`, `0x28–0x3a`, `0x3c–0x45`, `0x46–0x59`, `0x83–0x8a`, `0xa1–0xa8`, `0xb8–0xb9`.
 * NOTE: `0xbc` (territory tickets) IS in this set — tickets are direct via category,
 * not via the id whitelist. Cats `0xb`/`0xd`/`0xc3`/`0xe`/`0xbb`/`0xd3`/`0xf3`/`0xf4`
 * are absent (channel/menu/popup branches handle them earlier, or item ids gate 3).
 */
export const USE_DIRECT_CATEGORIES: ReadonlySet<number> = new Set([
  0x01, 0x06, 0x07, 0x08, 0x0a, 0x0c, 0x0f, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a,
  0x1b, 0x1c, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e,
  0x2f, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3c, 0x3d, 0x3e, 0x3f,
  0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f,
  0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88,
  0x89, 0x8a, 0x8c, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xaa, 0xab, 0xac, 0xad, 0xae,
  0xaf, 0xb0, 0xb1, 0xb2, 0xb8, 0xb9, 0xbc, 0xbd, 0xbf, 0xc0, 0xc1, 0xc2, 0xc5, 0xc6, 0xc8, 0xc9,
  0xca, 0xcb, 0xcc, 0xcd, 0xce, 0xd0, 0xd2, 0xf2,
]);

/**
 * Notable members: `0xc80..0xce3` = Jóias family (3200–3299), `0x6f1..0x6f3` =
 * Pergaminho Kefra N/M/A (1777–1779 — direct even though cat `0xf4` is NOT in
 * `USE_DIRECT_CATEGORIES`), `0x1324..0x1335` = Grande Baú do Tesouro family.
 */
export const USE_DIRECT_ID_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0xc80, 0xce3],
  [0xbcd, 0xbd2],
  [0xd75, 0xd78],
  [0xd81, 0xd83],
  [0x6f1, 0x6f3],
  [0x1324, 0x1335],
];

/**
 * + the dispatcher's own direct-use specials `0xd8b..0xd8f` (Bolsa do Andarilho +
 * Bênção de Hades I–IV, inline `0x373` builders before the predicate runs).
 * Includes 415 (`0x19f`, Ervas de Cura — cat `0xf3` is NOT a direct category) and
 * 3473 (`0xd91`, Pergaminho Kefra sem sufixo).
 */
export const USE_DIRECT_IDS: ReadonlySet<number> = new Set([
  0x1032, 0x1033, 0x14da, 0xd7b, 0xd7c, 0xd7d, 0xd7e, 0x1411, 0x154d, 0x154e, 0x286, 0x287, 0xd32,
  0xfbe, 0xfbf, 0xfae, 0xbcc, 0x6ed, 0x1034, 0xfcc, 0xfcd, 0xfce, 0xfcf, 0x1902, 0x19f, 0x2a7,
  0xd96, 0xf1, 0xfd0, 0xfd1, 0xd91, 0xd93, 0x1d9, 0x1035, 0xfd2, 0x1e9, 0xd97, 0xd98, 0x6f4, 0xc8a,
  0x1711, 0x1714, 0xffb, 0x1722, 0x1723, 0x190b, 0xd99, 0xd8b, 0xd8c, 0xd8d, 0xd8e, 0xd8f,
]);

/**
 * The destination is server-chosen (return point / town portal).
 */
export const CHANNEL_SCROLL_CATEGORIES: ReadonlySet<number> = new Set([0x0b, 0x0d]);

/**
 * Every bundled ItemList row with VOLATILE `0xb`/`0xd` — used by the main-side arm
 * validation (command-sender) where only the id is available:
 *   410/411/3429 Pergaminho Retorno (cat `0xb`)
 *   699/776/3430 Pergaminho do Teleporte / Portal (cat `0xd`)
 *   3456 Chamado Real (`Call_Of_King`, cat `0xd`)
 */
export const CHANNEL_SCROLL_IDS: ReadonlySet<number> = new Set([
  410, 411, 699, 776, 3429, 3430, 3456,
]);

/**
 * NO packet. Cats: `0xbb` (Cristais Elime/Sylphed/Thelion), `0xce` (Selo das Almas /
 * `0xd3` (Pedra Ideal). Id `0xd08` (Retorno da Habilidade) is a per-id popup branch.
 */
export const POPUP_ONLY_CATEGORIES: ReadonlySet<number> = new Set([0xbb, 0xce, 0xd3]);
export const POPUP_ONLY_IDS: ReadonlySet<number> = new Set([0xd08]);

/**
 * Items whose right-click opens a client HUD instead of a plain use:
 *   6417 (`0x1911`) OptionStone → option/refine window
 *   4141 (`0x102d`), 412 (`0x19c`), 413 (`0x19d`) → refine HUD
 *   4907 (`0x132b`) SRP_Coupon → coupon widget (canonical then also uses it)
 *   3442 (`0xd72`) Fogos de Artifício Prm → fireworks panel (cat `0x13` would
 *   otherwise classify direct — the id branch fires first in canonical)
 */
export const HUD_ITEM_IDS: ReadonlySet<number> = new Set([
  0x1911, 0x102d, 0x19c, 0x19d, 0x132b, 0xd72,
]);

/**
 * Canonical hard-blocks / explicit exclusions (silent no-op on right-click):
 *   3207 (`0xc87`) Jóia da Armazenagem — blocked before any branch
 *   4906 (`0x132a`) Victory_Coupon — explicitly excluded from the use emit
 */
export const USE_BLOCKED_IDS: ReadonlySet<number> = new Set([0xc87, 0x132a]);

/** Hunt-scroll (`Pedido de Caça`) use category — menu branch, needs a destination. */
const HUNT_SCROLL_CATEGORY = 0xc3;

const volatileOf = (item: UseKindInput): number | undefined =>
  item.effectSlots.find((s) => s.idx === MItemDefinition.VOLATILE)?.value;

const isInDirectIdRanges = (id: number): boolean =>
  USE_DIRECT_ID_RANGES.some(([lo, hi]) => id >= lo && id <= hi);

/**
 * priority (blocked → popup/hud specials → channel → menu → direct → equip).
 * Pure: same input always yields the same kind.
 */
export const itemUseKind = (item: UseKindInput): ItemUseKind => {
  if (USE_BLOCKED_IDS.has(item.id)) return 'blocked';
  const cat = volatileOf(item);
  if (cat !== undefined && POPUP_ONLY_CATEGORIES.has(cat)) return 'popup';
  if (POPUP_ONLY_IDS.has(item.id)) return 'popup';
  if (HUD_ITEM_IDS.has(item.id)) return 'hud';
  if (cat !== undefined && CHANNEL_SCROLL_CATEGORIES.has(cat)) return 'channel';
  if (cat === HUNT_SCROLL_CATEGORY && HUNT_SCROLL_CATALOG.has(item.id)) return 'menu';
  if (item.itemClass === GIFT_BOX_ITEM_CLASS) return 'direct';
  if (cat !== undefined && USE_DIRECT_CATEGORIES.has(cat)) return 'direct';
  if (USE_DIRECT_IDS.has(item.id) || isInDirectIdRanges(item.id)) return 'direct';
  return 'equip';
};
