/**
 * Shared parser for the 168-byte ItemList row layout.
 *
 * Both ItemList.bin and ExtraItem.bin records use the same row shape
 * (`` §ItemList.bin row layout).
 *
 * Confirmed offsets (relative to row base):
 *   +0x00..+0x3F  name (64 B Latin-1, NUL-padded; overlaid by Itemname.bin loader at runtime)
 *   +0x40..+0x41  equipModelId (u16 LE — DUAL semantic, see below)
 *   +0x46..+0x47  level (u16 LE — required level to equip)
 * +0x4A skillbar payload byte (per )
 *   +0x50..+0x7F   12 effect slots × { int16 effectIndex, int16 value }
 *   +0x84..+0x85  mesh (u16 LE — mesh family; 44=staff, 47=wand, etc., used by hardcoded bonuses)
 *   +0x88..+0x89  pos (u16 LE — equip-slot bitmask: 0x40=weapon, 0x80=offhand, etc.)
 *   +0x8E         grade (u8 — item grade tier)
 *   +0x98..+0x99   itemClass (u16 LE — equip-class category, gate for mount/transform paths)
 *   +0x9A..+0x9B   mountIndex (u16 LE — key into MountData.bin)
 *   +0x9E..+0x9F   maxStack (i16 LE — manual-split qty cap; ≠0 ⇒ manually stackable.
 * predicate")
 *
 *   - ALWAYS: per-slot model id, copied to entity+0x176..+0x190 along with +0x42 as
 *     a (modelA, modelB) tuple. Used by the renderer for per-slot mesh selection.
 *   - CONDITIONAL: when itemClass (+0x98) ∈ {0x16, 0x17, 0x18}, also acts as a row
 *     key into MountDataV.bin (mount/transform appearance table). For non-mount
 *     items, the MountDataV lookup is read-and-discarded by the game.
 *
 * `itemClass` (+0x98) is the canonical equip-class field. Values 0x16/0x17/0x18
 *
 * All other offsets are STATIC RE INCONCLUSIVE — preserved as `rawRow`.
 */

export const ROW_SIZE = 0xa8; // 168 — legacy/default row width
/** Highest field read is maxStack @0x9e (i16) ⇒ rows ≥ 0xa0 are safe. Global ships 164-byte rows. */
export const MIN_ROW_SIZE = 0xa0; // 160

export interface ItemEffectSlot {
  /** int16 effectIndex (255 = sentinel for empty slot). */
  idx: number;
  /** int16 value. */
  value: number;
}

export interface ItemRow {
  /** Full 168-byte row (post-XOR for ItemList.bin; raw for extraitem.bin). */
  rawRow: Buffer;
  /** 64-byte name field (raw, NUL-padded). May be overlaid by itemname.bin at runtime. */
  nameRaw: Buffer;
  /** Best-effort Latin-1 decode of nameRaw, trimmed at first NUL. */
  name: string;
  /**
   * u16 LE at +0x40. Always a per-slot model id (copied to entity+0x176..+0x190
   * — but ONLY when `itemClass` (+0x98) ∈ {0x16, 0x17, 0x18}; for other items
   * the game reads it then discards. Caller must apply that gate
   * before treating it as a MountDataV index.
   */
  equipModelId: number;
  /** u16 LE at +0x46 — required level to equip. */
  level: number;
  /** u8 at +0x4A — skillbar payload byte. */
  skillbar: number;
  /** 12 effect slots at +0x50..+0x7F. Empty slots use sentinel idx=255. */
  effectSlots: ItemEffectSlot[];
  /** u16 LE at +0x84 — mesh family (e.g., 44=staff, 47=wand). Used by hardcoded-bonus path. */
  mesh: number;
  /** u16 LE at +0x88 — equip-slot bitmask (e.g., 0x40=weapon, 0x80=offhand). */
  pos: number;
  /** u8 at +0x8E — item grade tier. */
  grade: number;
  /**
   * u16 LE at +0x98 — equip-class category. Values 0x16/0x17/0x18 indicate
   * mount/transform-class items; the game gates the MountDataV
   */
  itemClass: number;
  /** u16 LE at +0x9A — key into MountData.bin. */
  mountIndex: number;
  /**
   * i16 LE at +0x9E — manual-split quantity cap. `≠ 0` ⇒ the item is manually
   * "Quantos deseja separar?" gate). See
   * §"Manually-stackable predicate (the split-dialog oracle)".
   */
  maxStack: number;
}

/**
 * Parse the 168-byte row payload into the canonical ItemRow projection.
 *
 * The buffer must already be decrypted (XOR 0x5A applied for ItemList.bin;
 * extraitem.bin records are raw). The function does NOT mutate `rowBytes`.
 */
export const parseItemRow = (rowBytes: Buffer): ItemRow => {
  if (rowBytes.length < MIN_ROW_SIZE) {
    throw new Error(`parseItemRow: expected >= ${MIN_ROW_SIZE} bytes, got ${rowBytes.length}`);
  }

  // Defensive copy so consumers can mutate without surprising the caller.
  const rawRow = Buffer.from(rowBytes);
  const nameRaw = Buffer.from(rawRow.subarray(0x00, 0x40));
  const nulIdx = nameRaw.indexOf(0);
  const name = nameRaw.toString('latin1', 0, nulIdx === -1 ? nameRaw.length : nulIdx);
  const equipModelId = rawRow.readUInt16LE(0x40);
  const level = rawRow.readUInt16LE(0x46);
  const skillbar = rawRow.readUInt8(0x4a);
  const mesh = rawRow.readUInt16LE(0x84);
  const pos = rawRow.readUInt16LE(0x88);
  const grade = rawRow.readUInt8(0x8e);
  const itemClass = rawRow.readUInt16LE(0x98);
  const mountIndex = rawRow.readUInt16LE(0x9a);
  const maxStack = rawRow.readInt16LE(0x9e);

  const effectSlots: ItemEffectSlot[] = new Array(12);
  for (let slot = 0; slot < 12; slot++) {
    const off = 0x50 + slot * 4;
    effectSlots[slot] = {
      idx: rawRow.readInt16LE(off),
      value: rawRow.readInt16LE(off + 2),
    };
  }

  return {
    rawRow,
    nameRaw,
    name,
    equipModelId,
    level,
    skillbar,
    effectSlots,
    mesh,
    pos,
    grade,
    itemClass,
    mountIndex,
    maxStack,
  };
};
