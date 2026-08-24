import type { Skill } from './skill-types';
import type { AssetHealth } from './asset-health-types';

export interface ItemEffectSlot {
  /** int16 effectIndex (255 = sentinel for empty slot). */
  idx: number;
  /** int16 value. */
  value: number;
}

export interface ItemHelpLine {
  /** u16 color (16-bit mask per game storage). */
  color: number;
  text: string;
}

export interface ItemHelp {
  count: number;
  lines: ItemHelpLine[];
}

/** Visual / variant fields from MountDataV.bin row, joined into the item. */
export interface ItemMountVisual {
  mountClass: number;
  /** 6 effect-slot fields. */
  effectFields: readonly [number, number, number, number, number, number];
  /** 3 slot color/bonus values (-1 sentinel preserved for "unused"). */
  slotColors: readonly [number, number, number];
  scaleRatio: number;
  refineBonusIndex: number;
}

/**
 * Joined mount info. Present when the item is mount-class (itemClass ∈ {0x16,0x17,0x18})
 * AND either has `mountIndex > 0` (key into MountData.bin) OR a valid `mountVKey`
 * within bounds (key into MountDataV.bin).
 *
 * Numeric stat fields default to 0 (or 7000 for `baseHp`) when MountData is
 * unavailable for the row; `visual` only when MountDataV[mountVKey] resolved.
 */
export interface ItemMountInfo {
  /** From MountData[mountIndex] +0x1C. Defaults to 7000 if MountData is unavailable. */
  baseHp: number;
  /** From MountData[mountIndex] +0x20. Physical damage for mount-adult/special items. */
  damage: number;
  /** From MountData[mountIndex] +0x24. Magic damage. */
  magic: number;
  /** From MountData[mountIndex] +0x28. Flat evasion (mount-special only). */
  evasion: number;
  /** From MountData[mountIndex] +0x2C. Flat all-resist (mount-special only). */
  resistAll: number;
  visual?: ItemMountVisual;
}

/**
 * Unified item view — denormalized from the 6 canonical sources.
 *
 * Field provenance:
 *   id            — array index in ItemList.bin
 *   name          — Itemname.bin (Latin-1 decoded), or extraitem overlay name fallback
 *   equipModelId  — ItemList row +0x40 (post-overlay). Per-slot model id; conditionally
 *                   doubles as MountDataV key when `itemClass` ∈ {0x16,0x17,0x18}.
 *   skillbar      — ItemList row +0x4A (post-overlay)
 *   effectSlots   — ItemList row +0x50..+0x7F (post-overlay)
 *   itemClass     — ItemList row +0x98. Equip-class category (canonical gate field).
 *   mountIndex    — ItemList row +0x9A (post-overlay; key into MountData.bin)
 *   maxStack      — ItemList row +0x9E. Manual-split qty cap; ≠0 ⇒ manually stackable
 *   help          — itemhelp.dat (optional)
 *   mountInfo     — joined from MountData + MountDataV (optional)
 */
export interface Item {
  id: number;
  name: string;
  /** u16 from row +0x40. Per-slot model id; conditionally MountDataV key when itemClass ∈ mount set. */
  equipModelId: number;
  /** u16 from row +0x46. Required level to equip. */
  level: number;
  /** u8 from row +0x4A. Skillbar payload byte. */
  skillbar: number;
  /** 12 wire effect slots from row +0x50..+0x7F. Sentinel idx=0 / idx=255 = empty slot. */
  effectSlots: ItemEffectSlot[];
  /** u16 from row +0x84. Mesh family (44=staff, 47=wand etc.). */
  mesh: number;
  /** u16 from row +0x88. Equip-slot bitmask. */
  pos: number;
  /** u8 from row +0x8E. Item grade tier. */
  grade: number;
  /** u16 from row +0x98. Equip-class category; canonical gate for mount paths. */
  itemClass: number;
  /** u16 from row +0x9A. Key into MountData.bin. */
  mountIndex: number;
  /**
   * i16 from row +0x9E. Manual-split qty cap. `≠ 0` ⇒ the item is manually
   * separar?" split-dialog gate —
   * §"Manually-stackable predicate"). Also the real per-item stack cap.
   */
  maxStack: number;
  /** True iff the icon cache extracted a PNG for this id (`wydicon://` resolvable). */
  hasIcon: boolean;
  help?: ItemHelp;
  mountInfo?: ItemMountInfo;
}

export interface ItemDbMeta {
  itemCount: number;
  namedCount: number;
  helpCount: number;
  extraItemOverlayCount: number;
  mountDataCount: number;
  mountDataVCount: number;
  skillViewCount: number;
  loadedAtMs: number;
  /**
   * Present when ≥1 boot-critical asset failed to parse. The DB is still a valid
   * (possibly empty/partial) structure — this signal drives the on-screen
   * "dados incompletos" banner so a degraded load is never silent.
   */
  degraded?: AssetHealth;
}

export interface ItemDb {
  items: Map<number, Item>;
  skillsById: ReadonlyMap<number, Skill>;
  meta: ItemDbMeta;
}
