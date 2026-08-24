export interface MItemEffect {
  index: number;
  value: number;
}

/**
 * Wire item record (12 bytes on the wire and in entity inventory/equip slots).
 *
 * - bytes 0-1  : `index` (u16 itemId)
 * - bytes 2-3  : `stackCount` (i16, clamped 1..500 on read)
 * - bytes 4-5  : `field04` (unmapped — preserved verbatim)
 * - bytes 6-11 : `effects[3]` (3 × {u8 idx, u8 val}); for mounts these encode HP/SANC/Life/Feed/Kill
 */
export interface MItem {
  index: number;
  stackCount: number;
  field04: number;
  effects: [MItemEffect, MItemEffect, MItemEffect];
}

/** Bucket from game — 1=base, 2=tier2, 3=tier3 of `imóvel` label. */
export type ImmovableTier = 1 | 2 | 3;

export interface ViewItemEffect {
  index: number;
  value: number;
  label: string;
  hidden: boolean;
  /** Final formatted text ready for display (e.g. "Aumento de Dano : 2948") */
  displayText: string;
  source?: 'base' | 'wire' | 'hardcoded';
  /** Color tier for display — computed from RE wire quality thresholds */
  colorTier?: 'normal' | 'green' | 'yellow' | 'orange' | 'blue' | 'pvp';
  /** Raw value before SANC scaling (wire effects only) — used for "raw (scaled)" display */
  rawValue?: number;
}

/** Renderer-enriched item with human-readable name and joined data from the item DB. */
export interface ViewItem {
  index: number;
  /** Full name with "+N" and "[G]" suffixes appended. */
  name: string;
  displayName: string;
  /** SANC level (1..16) when refined; undefined when SANC=0. */
  refineLevel?: number;
  /** Gem letter ('E'..'I') when socketed; undefined otherwise. */
  gemLetter?: string;
  /** Live stack count from wire bytes 2-3 (clamped 1..500). Undefined when ≤1. */
  stackCount?: number;
  /** Count for the canonical `+N (count)` title form (class 0x37 / amagos). */
  titleCount?: number;
  /** Tier of the `imóvel` red body label (1/2/3); undefined when not bound. */
  immovable?: ImmovableTier;
  effects: ViewItemEffect[];
  /**
   * Tooltip help lines from itemhelp.dat (game tooltip body text).
   * `color` is a CSS-ready string already resolved from the wire u16 ARGB1555
   * during enrichment — UI consumers apply it directly. Undefined when the
   * item has no help entry.
   */
  helpLines?: { color: string; text: string }[];
  /**
   * Mount visual / variant fields from MountDataV.bin.
   * Present when the item's `mountVKey` (ItemList row +0x40) resolves to a
   * valid MountDataV row (bounds-checked < 500). Independent of mountIndex.
   */
  mountVisual?: {
    mountClass: number;
    slotColors: readonly [number, number, number];
    scaleRatio: number;
    refineBonusIndex: number;
  };
  /** Mount runtime base (joined from MountData.bin). Present for mount-shaped items. */
  mountRuntime?: { baseHp: number };
}

export interface MEquip {
  items: MItem[];
}

export interface MInventory {
  items: MItem[];
}

export interface MItemDataEffect {
  index: number;
  value: number;
}

export interface MItemData {
  name: string;
  mesh1: number;
  mesh2: number;
  level: number;
  str: number;
  int: number;
  dex: number;
  con: number;
  effect: MItemDataEffect[];
  price: number;
  unique: number;
  pos: number;
  extreme: number;
  grade: number;
}
