/**
 * Pure merge function that builds the unified `ItemDb` from the 7 parser outputs.
 *
 * Spec: (boot pipeline).
 *
 * Steps:
 *   1. Build base items from ItemList rows (one Item per id 0..6499).
 *   2. Apply extraitem overlay (full row replace by id, last-write-wins).
 *   3. Attach name from itemname.bin Map (overlays ItemList row +0x00).
 *   4. Attach help from itemhelp.dat Map (optional per item).
 *   5. Resolve mount join (mountIndex → MountData; mountVKey → MountDataV).
 *   6. Build skill views (`buildSkill` per SkillData.bin row).
 *   7. Compute meta and return.
 */

import type { Item, ItemDb, ItemMountInfo, ItemMountVisual } from '@shared/types/item-db-types';
import type { Skill, SkillRow } from '@shared/types/skill-types';
import { buildSkill } from './skill-builder';
import type { ExtraItemRecord, ItemListRow, MountDataRow, MountDataVRow } from './parsers';
import type { ItemHelp } from './parsers';

/** MountDataV.bin has 500 entries — `equipModelId` must be < this for a valid lookup. */
const MOUNT_DATA_V_MAX = 500;
// Anchor: itemname.bin[5001] = "Toque Sagrado". Entries above 5137 are cash-shop items.
const SKILL_NAME_BAND_START = 5000;
const SKILL_NAME_BAND_END = 5137;
/** Fallback used when MountData[mountIndex].baseHp is 0 or row is missing. */
const MOUNT_HP_FALLBACK = 7000;
/**
 * Item-class values (ItemList row +0x98) that gate the MountDataV consumption
 * Items outside this set read +0x40 then discard the resulting MountDataV row.
 */
const MOUNT_CLASS_GATE = new Set([0x16, 0x17, 0x18]);

export interface BuildItemDbInputs {
  itemListRows: ItemListRow[];
  extraItemRecords: ExtraItemRecord[];
  nameMap: Map<number, string>;
  helpMap: Map<number, ItemHelp>;
  mountRows: MountDataRow[];
  mountVRows: MountDataVRow[];
  skillRows: SkillRow[];
  /** IDs whose icon PNG was extracted by `IconCacheManager`; sets `Item.hasIcon`. */
  iconAvailableIds: ReadonlySet<number>;
}

export const buildItemDb = (inputs: BuildItemDbInputs): ItemDb => {
  const {
    itemListRows,
    extraItemRecords,
    nameMap,
    helpMap,
    mountRows,
    mountVRows,
    skillRows,
    iconAvailableIds,
  } = inputs;

  // Step 1: base items from ItemList rows.
  const items = new Map<number, Item>();
  for (const row of itemListRows) {
    items.set(row.id, {
      id: row.id,
      name: row.name,
      equipModelId: row.equipModelId,
      level: row.level,
      skillbar: row.skillbar,
      effectSlots: row.effectSlots,
      mesh: row.mesh,
      pos: row.pos,
      grade: row.grade,
      itemClass: row.itemClass,
      mountIndex: row.mountIndex,
      maxStack: row.maxStack,
      hasIcon: iconAvailableIds.has(row.id),
    });
  }

  // Step 2: extraitem overlay — full row replace by id (last-write-wins).
  let overlayCount = 0;
  for (const record of extraItemRecords) {
    const item = items.get(record.id);
    if (!item) continue;
    item.name = record.rowParsed.name;
    item.equipModelId = record.rowParsed.equipModelId;
    item.level = record.rowParsed.level;
    item.skillbar = record.rowParsed.skillbar;
    item.effectSlots = record.rowParsed.effectSlots;
    item.mesh = record.rowParsed.mesh;
    item.pos = record.rowParsed.pos;
    item.grade = record.rowParsed.grade;
    item.itemClass = record.rowParsed.itemClass;
    item.mountIndex = record.rowParsed.mountIndex;
    item.maxStack = record.rowParsed.maxStack;
    overlayCount++;
  }

  // Step 3: itemname.bin overlay (only the name field).
  let namedCount = 0;
  for (const [id, name] of nameMap) {
    const item = items.get(id);
    if (!item) continue;
    item.name = name;
    namedCount++;
  }

  // Step 4: itemhelp.dat attach (optional per item).
  let helpCount = 0;
  for (const [id, help] of helpMap) {
    const item = items.get(id);
    if (!item) continue;
    item.help = help;
    helpCount++;
  }

  // Step 5: mount join.
  for (const item of items.values()) {
    let mountInfo: ItemMountInfo | undefined;

    // 5a: MountData lookup via mountIndex.
    if (item.mountIndex > 0 && item.mountIndex < mountRows.length) {
      const md = mountRows[item.mountIndex];
      if (md) {
        mountInfo = {
          baseHp: md.baseHp || MOUNT_HP_FALLBACK,
          damage: md.damage,
          magic: md.magic,
          evasion: md.evasion,
          resistAll: md.resistAll,
        };
      }
    }

    // 5b: MountDataV lookup via equipModelId. Bounds-checked AND gated by
    //     itemClass ∈ {0x16,0x17,0x18} — same gate the game uses
    //     is just a generic per-slot modelId, NOT a MountDataV row index.
    if (
      MOUNT_CLASS_GATE.has(item.itemClass) &&
      item.equipModelId > 0 &&
      item.equipModelId < MOUNT_DATA_V_MAX
    ) {
      const v = mountVRows[item.equipModelId];
      if (v) {
        const visual: ItemMountVisual = {
          mountClass: v.mountClass,
          effectFields: [
            v.effectField0,
            v.effectField1,
            v.effectField2,
            v.effectField3,
            v.effectField4,
            v.effectField5,
          ] as const,
          slotColors: [v.slotColor0, v.slotColor1, v.slotColor2] as const,
          scaleRatio: v.scaleRatio,
          refineBonusIndex: v.refineBonusIndex,
        };
        // If mountInfo wasn't created in 5a, materialize it with fallback values.
        if (!mountInfo) {
          mountInfo = {
            baseHp: MOUNT_HP_FALLBACK,
            damage: 0,
            magic: 0,
            evasion: 0,
            resistAll: 0,
          };
        }
        mountInfo.visual = visual;
      }
    }

    if (mountInfo) item.mountInfo = mountInfo;
  }

  // Step 6: build skill views.
  const skillNameBand = new Map<number, string>();
  for (const [id, name] of nameMap) {
    if (id < SKILL_NAME_BAND_START || id > SKILL_NAME_BAND_END) continue;
    skillNameBand.set(id - SKILL_NAME_BAND_START, name);
  }

  const skillsById = new Map<number, Skill>();
  for (const row of skillRows) {
    if (row.entryId === 0) continue;
    skillsById.set(row.id, buildSkill(row, skillNameBand));
  }

  return {
    items,
    skillsById,
    meta: {
      itemCount: items.size,
      namedCount,
      helpCount,
      extraItemOverlayCount: overlayCount,
      mountDataCount: mountRows.length,
      mountDataVCount: mountVRows.length,
      skillViewCount: skillsById.size,
      loadedAtMs: Date.now(),
    },
  };
};
