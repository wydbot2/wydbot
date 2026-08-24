import { create } from 'zustand';
import type { MPosition, MScore, MAffectPacket } from '@shared/types';
import type { ViewItem } from '@shared/types/item-types';
import { MAXL_AFFECT } from '@shared/constants/game-basics';
import { MItemDefinition } from '@shared/constants/item-definitions';
import { EQUIP_SLOT_MOUNT } from '@shared/constants/equip-slots';
import { getMountMaxHp } from '../lib/mount-hp';
import { EMPTY_VIEW_ITEM } from '../lib/item-enrich';

/**
 * Snapshot of the equipped mount derived from `equip[EQUIP_SLOT_MOUNT]`.
 * Numeric fields are 0 when `equipped` is false (consumers don't need null checks).
 *
 * Two wire constants in `MItemDefinition` are misnomers kept for wire compatibility:
 * - `MOUNTSANC` (effect 0x51, byte 8) actually carries the mount's **level**, not a
 *   sanctification grade.
 * - `MOUNTKILL` (effect 0x53, byte 11) is the **quality tier**, NOT a kill counter.
 *
 * Project field names (`level`, `qualityLevel`, etc.) reflect the in-game labels.
 */
export interface MountState {
  equipped: boolean;
  itemId: number;
  hp: number;
  maxHp: number;
  level: number;
  vitality: number;
  feed: number;
  qualityLevel: number;
}

const emptyMount: MountState = {
  equipped: false,
  itemId: 0,
  hp: 0,
  maxHp: 0,
  level: 0,
  vitality: 0,
  feed: 0,
  qualityLevel: 0,
};

const findEffectValue = (item: ViewItem, effectIndex: number): number => {
  for (const e of item.effects) {
    if (e.index === effectIndex) return e.value;
  }
  return 0;
};

/**
 * Derive a `MountState` snapshot from the mount slot's enriched ViewItem.
 * Wire effect indices keep their canonical names; project-level field names
 * (`level`, `vitality`, `qualityLevel`) reflect the in-game labels. See
 * `MountState` jsdoc.
 */
export const deriveMountState = (item: ViewItem | undefined): MountState => {
  if (!item || item.index === 0) return emptyMount;
  const level = findEffectValue(item, MItemDefinition.MOUNTSANC);
  return {
    equipped: true,
    itemId: item.index,
    hp: findEffectValue(item, MItemDefinition.MOUNTHP),
    maxHp: getMountMaxHp(item.index, level),
    level,
    vitality: findEffectValue(item, MItemDefinition.MOUNTLIFE),
    feed: findEffectValue(item, MItemDefinition.MOUNTFEED),
    qualityLevel: findEffectValue(item, MItemDefinition.MOUNTKILL),
  };
};

/**
 * CharToWorld IPC payload for the player store (view-level, exp as number, equip as ViewItem[])
 */
export interface CharToWorldData {
  name: string;
  guildIndex: number;
  charClass: number;
  gold: number;
  exp: number;
  clientIndex: number;
  mobIndex: number;
  position: MPosition;
  finalScore: MScore;
  equip: ViewItem[];
  inventory: ViewItem[];
  bagUnlock: boolean[];
  statusPoint: number;
  cpPoint: number;
  skillPoint: number;
  criticalRate: number;
  saveMana: number;
  attackSpeed: number;
  pvpDamage: number;
  pvpDefense: number;
  resist: [number, number, number, number];
  gameMode: number;
  skillSlots: [number, number, number, number, number];
  learnedSkill: [number, number];
  cp: number;
  evolutionTier: number; // 0=Mortal, 1=Arch, 2=Celestial
}

/**
 * Player store state and actions
 */
interface PlayerState {
  // Basic info
  name: string;
  guildIndex: number;
  charClass: number;
  clientIndex: number;
  mobIndex: number;

  // Resources
  gold: number;
  exp: number;
  cp: number;

  // Position
  position: MPosition;
  /** `Date.now()` of the last teleport — freshness clock for entity discovery. */
  lastTeleportMs: number;

  // Stats (from MScore FinalScore)
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  str: number;
  int: number;
  dex: number;
  con: number;
  damage: number;
  defense: number;
  movementSpeed: number;

  // Points
  statusPoint: number;
  cpPoint: number;
  skillPoint: number;

  // Mastery levels
  special: [number, number, number, number];

  // Derived combat stats
  criticalRate: number;
  saveMana: number;
  attackSpeed: number;
  pvpDamage: number;
  pvpDefense: number;
  resist: [number, number, number, number];

  // Entity stats (from RefreshScore)
  accuracy: number;
  evasion: number;
  penetration: number;
  absorption: number;
  critDamageBonus: number;
  critDamageReduction: number;

  // Game state
  gameMode: number;
  evolutionTier: number; // 0=Mortal, 1=Arch, 2=Celestial
  skillSlots: [number, number, number, number, number];
  learnedSkill: [number, number]; // [Learn[0], Learn[1]] — decode with getLearnedSkillIds()

  // Affects (live buffs/debuffs from 0x336 RefreshScore wire format —
  // 32 × `MAffectPacket` entries; empty slots have `timeOctets === 0`).
  // `affectsSyncMs` captures the wall-clock at IPC arrival so the UI can
  // project remaining duration as `max(0, timeOctets*8 − (now − syncMs)/1000)`.
  affects: MAffectPacket[];
  affectsSyncMs: number;

  // Equipment & Inventory
  equip: ViewItem[];
  inventory: ViewItem[];
  bagUnlock: boolean[];
  /** `Date.now()` of the last full inventory rewrite (`setCharToWorld`/0x114). */
  inventoryFullSyncAt: number;

  // Bank storage (kind-2): 120 slots = 3 pages × 40 (wire idx = page*40 + slot).
  // Empty slot = item.index===0. Populated by the inbound storage echo + 0x339
  storage: ViewItem[];
  bankGold: number;

  // Mount snapshot (derived from equip[EQUIP_SLOT_MOUNT])
  mount: MountState;

  // Actions
  setCharToWorld: (data: CharToWorldData) => void;
  updateFromRefreshScore: (data: {
    score: MScore;
    currentHp: number;
    currentMp: number;
    criticalRate: number;
    saveMana: number;
    attackSpeed: number;
    accuracy: number;
    evasion: number;
    penetration: number;
    absorption: number;
    critDamageBonus: number;
    critDamageReduction: number;
    pvpDamage: number;
    pvpDefense: number;
    affects: MAffectPacket[];
    affectsSyncMs: number;
  }) => void;
  /** Absolute HP/MP sync (0x181 / 0x18A local). Clamps to current max. */
  applyHpMpSync: (data: { currentHp: number; currentMp?: number }) => void;
  updatePosition: (position: MPosition) => void;
  /** Stamp the teleport clock; entities last seen before this are stale. */
  markTeleport: () => void;
  updateEquipSlot: (slotIndex: number, item: ViewItem) => void;
  updateInventorySlot: (slotIndex: number, item: ViewItem) => void;
  /** Optimistically empties a bag slot (item-destroy has no server ack). */
  clearInventorySlot: (slotIndex: number) => void;
  /** Replaces the whole storage array (server sends full pages). */
  setStorageBulk: (storage: ViewItem[]) => void;
  updateStorageSlot: (slotIndex: number, item: ViewItem) => void;
  clearStorageSlot: (slotIndex: number) => void;
  /** Sets the absolute bank gold balance (S2C 0x339, not a delta). */
  setBankGold: (gold: number) => void;
  /** Sets the absolute hand gold value (S2C 0x3AF). */
  setGold: (gold: number) => void;
  /** Applies a delta to hand gold (0x171/0x387/0x388/0x37A/0x1BF). */
  applyGoldDelta: (delta: number) => void;
  /** Writes a ViewItem to an inventory slot (0x171 normal-item branch). */
  applyTradeItemAdd: (slot: number, viewItem: ViewItem) => void;
  /** Applies a server 0x376 item-move echo: swaps two slots across equip(0)/bag(1)/storage(2). */
  applyItemSwap: (aKind: number, aSlot: number, bKind: number, bSlot: number) => void;
  reset: () => void;
}

export type PlayerDisplayInfo = Pick<
  PlayerState,
  | 'name'
  | 'level'
  | 'currentHp'
  | 'maxHp'
  | 'currentMp'
  | 'maxMp'
  | 'damage'
  | 'defense'
  | 'str'
  | 'int'
  | 'dex'
  | 'con'
  | 'gold'
  | 'cp'
  | 'charClass'
  | 'evolutionTier'
  | 'attackSpeed'
  | 'pvpDamage'
  | 'pvpDefense'
  | 'criticalRate'
  | 'saveMana'
  | 'resist'
  | 'accuracy'
  | 'evasion'
  | 'penetration'
  | 'absorption'
  | 'critDamageBonus'
  | 'critDamageReduction'
  | 'movementSpeed'
  | 'gameMode'
  | 'equip'
  | 'inventory'
  | 'bagUnlock'
  | 'skillPoint'
  | 'skillSlots'
  | 'affects'
  | 'affectsSyncMs'
  | 'mount'
  | 'special'
>;

const defaultAffects: MAffectPacket[] = Array.from({ length: MAXL_AFFECT }, () => ({
  timeOctets: 0,
  type: 0,
}));

const initialState = {
  name: '',
  guildIndex: 0,
  charClass: 0,
  clientIndex: 0,
  mobIndex: 0,
  gold: 0,
  exp: 0,
  cp: 0,
  position: { x: 0, y: 0 },
  lastTeleportMs: 0,
  level: 0,
  currentHp: 0,
  maxHp: 0,
  currentMp: 0,
  maxMp: 0,
  str: 0,
  int: 0,
  dex: 0,
  con: 0,
  damage: 0,
  defense: 0,
  movementSpeed: 0,
  statusPoint: 0,
  cpPoint: 0,
  skillPoint: 0,
  criticalRate: 0,
  saveMana: 0,
  attackSpeed: 0,
  pvpDamage: 0,
  pvpDefense: 0,
  resist: [0, 0, 0, 0] as [number, number, number, number],
  special: [0, 0, 0, 0] as [number, number, number, number],
  accuracy: 0,
  evasion: 0,
  penetration: 0,
  absorption: 0,
  critDamageBonus: 0,
  critDamageReduction: 0,
  gameMode: 0,
  evolutionTier: 0,
  skillSlots: [0, 0, 0, 0, 0] as [number, number, number, number, number],
  learnedSkill: [0, 0] as [number, number],
  affects: defaultAffects,
  affectsSyncMs: 0,
  equip: [] as ViewItem[],
  inventory: [] as ViewItem[],
  bagUnlock: [] as boolean[],
  inventoryFullSyncAt: 0,
  storage: [] as ViewItem[],
  bankGold: 0,
  mount: emptyMount,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,

  // Actions
  setCharToWorld: (data) =>
    set({
      name: data.name,
      guildIndex: data.guildIndex,
      charClass: data.charClass,
      clientIndex: data.clientIndex,
      mobIndex: data.mobIndex,
      gold: data.gold,
      exp: data.exp,
      cp: data.cp,
      position: data.position,
      level: data.finalScore.level + 1, // WYD level is 0-indexed
      currentHp: data.finalScore.currHp,
      maxHp: data.finalScore.maxHp,
      currentMp: data.finalScore.currMp,
      maxMp: data.finalScore.maxMp,
      str: data.finalScore.str,
      int: data.finalScore.int,
      dex: data.finalScore.dex,
      con: data.finalScore.con,
      damage: data.finalScore.damage,
      defense: data.finalScore.defense,
      movementSpeed: data.finalScore.movementSpeed,
      special: data.finalScore.special,
      statusPoint: data.statusPoint,
      cpPoint: data.cpPoint,
      skillPoint: data.skillPoint,
      criticalRate: data.criticalRate,
      saveMana: data.saveMana,
      attackSpeed: data.attackSpeed,
      pvpDamage: data.pvpDamage,
      pvpDefense: data.pvpDefense,
      resist: data.resist,
      gameMode: data.gameMode,
      evolutionTier: data.evolutionTier,
      skillSlots: data.skillSlots,
      learnedSkill: data.learnedSkill,
      equip: data.equip,
      inventory: data.inventory,
      inventoryFullSyncAt: Date.now(),
      bagUnlock: data.bagUnlock,
      mount: deriveMountState(data.equip[EQUIP_SLOT_MOUNT]),
    }),

  updateFromRefreshScore: (data) =>
    set({
      level: data.score.level + 1, // WYD level is 0-indexed
      currentHp: data.currentHp ?? data.score.currHp,
      maxHp: data.score.maxHp,
      currentMp: data.currentMp ?? data.score.currMp,
      maxMp: data.score.maxMp,
      str: data.score.str,
      int: data.score.int,
      dex: data.score.dex,
      con: data.score.con,
      damage: data.score.damage,
      defense: data.score.defense,
      movementSpeed: data.score.movementSpeed,
      special: data.score.special,
      criticalRate: data.criticalRate,
      saveMana: data.saveMana,
      attackSpeed: data.attackSpeed,
      accuracy: data.accuracy,
      evasion: data.evasion,
      penetration: data.penetration,
      absorption: data.absorption,
      critDamageBonus: data.critDamageBonus,
      critDamageReduction: data.critDamageReduction,
      pvpDamage: data.pvpDamage,
      pvpDefense: data.pvpDefense,
      affects: data.affects,
      affectsSyncMs: data.affectsSyncMs,
    }),

  applyHpMpSync: ({ currentHp, currentMp }) =>
    set((s) => ({
      currentHp: Math.max(0, Math.min(s.maxHp, currentHp)),
      ...(currentMp == null ? null : { currentMp: Math.max(0, Math.min(s.maxMp, currentMp)) }),
    })),

  updatePosition: (position) => set({ position }),

  markTeleport: () => set({ lastTeleportMs: Date.now() }),

  updateEquipSlot: (slotIndex, item) =>
    set((state) => {
      if (slotIndex < 0 || slotIndex >= state.equip.length) return state;
      const newEquip = state.equip.slice();
      newEquip[slotIndex] = item;
      const next: Partial<PlayerState> = { equip: newEquip };
      if (slotIndex === EQUIP_SLOT_MOUNT) {
        next.mount = deriveMountState(item);
      }
      return next;
    }),

  updateInventorySlot: (slotIndex, item) =>
    set((state) => {
      if (slotIndex < 0 || slotIndex >= state.inventory.length) return state;
      const newInventory = state.inventory.slice();
      newInventory[slotIndex] = item;
      return { inventory: newInventory };
    }),

  clearInventorySlot: (slotIndex) =>
    set((state) => {
      if (slotIndex < 0 || slotIndex >= state.inventory.length) return state;
      const newInventory = state.inventory.slice();
      newInventory[slotIndex] = EMPTY_VIEW_ITEM;
      return { inventory: newInventory };
    }),

  setStorageBulk: (storage) => set({ storage }),

  updateStorageSlot: (slotIndex, item) =>
    set((state) => {
      if (slotIndex < 0 || slotIndex >= state.storage.length) return state;
      const newStorage = state.storage.slice();
      newStorage[slotIndex] = item;
      return { storage: newStorage };
    }),

  clearStorageSlot: (slotIndex) =>
    set((state) => {
      if (slotIndex < 0 || slotIndex >= state.storage.length) return state;
      const newStorage = state.storage.slice();
      newStorage[slotIndex] = EMPTY_VIEW_ITEM;
      return { storage: newStorage };
    }),

  setBankGold: (gold) => set({ bankGold: gold }),

  setGold: (gold) => set({ gold }),

  applyGoldDelta: (delta) => set((s) => ({ gold: s.gold + delta })),

  applyTradeItemAdd: (slot, viewItem) =>
    set((state) => {
      if (slot < 0 || slot >= state.inventory.length) return state;
      const newInventory = state.inventory.slice();
      newInventory[slot] = viewItem;
      return { inventory: newInventory };
    }),

  applyItemSwap: (aKind, aSlot, bKind, bSlot) =>
    set((state) => {
      const fieldOf: Record<number, 'equip' | 'inventory' | 'storage'> = {
        0: 'equip',
        1: 'inventory',
        2: 'storage',
      };
      const aField = fieldOf[aKind];
      const bField = fieldOf[bKind];
      if (!aField || !bField) return state;
      const srcArr = state[aField];
      const dstArr = state[bField];
      if (aSlot < 0 || aSlot >= srcArr.length || bSlot < 0 || bSlot >= dstArr.length) return state;
      const newSrc = srcArr.slice();
      const newDst = aKind === bKind ? newSrc : dstArr.slice();
      const tmp = newSrc[aSlot];
      newSrc[aSlot] = newDst[bSlot];
      newDst[bSlot] = tmp;
      return { [aField]: newSrc, [bField]: newDst };
    }),

  reset: () => set(initialState),
}));
