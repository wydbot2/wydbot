import type { MPacketHeader, MPosition, MScore, MSelChar } from '@shared/types/game-structures';
import type { MItem, MEquip } from '@shared/types/item-types';
import type { MAffect, MAffectPacket } from '@shared/types/affect-types';

/** Login response — contains hash key table and character list. */
export interface ParsedLoginSuccessful {
  header: MPacketHeader;
  hashKeyTable: Uint8Array;
  offset28: number;
  selChar: MSelChar;
  cargo: MItem[];
  cargoCoin: number;
  accName: string;
  keys: Uint8Array;
}

/** Updated character list — sent after create/delete or on re-request. */
export interface ParsedResendCharList {
  header: MPacketHeader;
  unknown4: number;
  selChar: MSelChar;
}

/** Full character data when entering the game world. */
export interface ParsedCharToWorld {
  header: MPacketHeader;
  position: MPosition;
  name: string;
  guildIndex: number;
  charClass: number;
  gold: number;
  exp: bigint;
  baseScore: MScore;
  finalScore: MScore;
  equip: MEquip;
  inventory: MItem[];
  bagUnlock: boolean[];
  clientIndex: number;
  learnedSkill: [number, number];
  statusPoint: number;
  cpPoint: number;
  skillPoint: number;
  criticalRate: number;
  saveMana: number;
  attackSpeed: number;
  pvpDamage: number;
  pvpDefense: number;
  resist: [number, number, number, number];
  mobIndex: number;
  gameMode: number;
  skillSlots: [number, number, number, number, number];
  cp: number;
  affects: MAffect[];
  serverTime: number;
  evolutionTier: number; // 0=Mortal, 1=Arch, 2=Celestial
}

/** Mob spawn — position, visual info, score, and guild data. */
export interface ParsedCreateMob {
  header: MPacketHeader;
  position: MPosition;
  index: number;
  name: string;
  actionType: number;
  mobClassNibble: number;
  /** Compose-menu root key (entity+0x750 == packet+0xB4); selects the Item-Mix group. */
  composeRoot: number;
  items: number[];
  affects: MAffectPacket[];
  guildIndex: number;
  guildMemberType: number;
  score: MScore;
  type: number;
  tab: string;
}

/** Movement update — origin, destination, speed, and type. */
export interface ParsedMove {
  header: MPacketHeader;
  lastPosition: MPosition;
  moveType: number;
  speedMove: number;
  command: string;
  destiny: MPosition;
}

/** Chat or system message — single text payload. */
export interface ParsedChatMessage {
  header: MPacketHeader;
  message: string;
}

/** Whisper (private) message — target name and text. */
export interface ParsedWhisperMessage {
  header: MPacketHeader;
  command: string;
  message: string;
}

/** Periodic score refresh — stats, affects, and combat modifiers. */
export interface ParsedRefreshScore {
  header: MPacketHeader;
  score: MScore;
  criticalRate: number;
  saveMana: number;
  affects: MAffectPacket[];
  transformId: number;
  currentHp: number;
  currentMp: number;
  magicIncrement: number;
  accuracy: number;
  evasion: number;
  penetration: number;
  absorption: number;
  critDamageBonus: number;
  critDamageReduction: number;
  attackSpeed: number;
  pvpDamage: number;
  pvpDefense: number;
}

/** Absolute HP/MP sync for one entity (`0x181` CompactHpMpSync). */
export interface ParsedCompactHpMpSync {
  header: MPacketHeader;
  currHp: number;
  currMp: number;
}

/** Absolute HP after a damage hit (`0x18A` DamageEvent); popup amount is dropped. */
export interface ParsedDamageEvent {
  header: MPacketHeader;
  currHp: number;
}

/** Soft-despawn by object id (`0x16f` DespawnByObjectId). */
export interface ParsedDespawnByObjectId {
  header: MPacketHeader;
  objectId: number;
}

/** Mob death event — killer, victim, and experience gained. */
export interface ParsedMobDeath {
  header: MPacketHeader;
  hold: number;
  killed: number;
  killer: number;
  exp: bigint;
}

/**
 * Inbound damage event — `0x39D` (1 target) / `0x39E` (≤2) / `0x367` (≤13).
 * (`{u16 targetId, i32 dmg}`); `+0x2A` is the attacker, not a target.
 */
export interface ParsedSingleAttackInbound {
  header: MPacketHeader;
  /** Attacker mob index (packet `+0x2A` / header clientId). */
  attackerIndex: number;
  /** Targets taking damage, parsed from the `+0x3C` array. */
  targets: { targetIndex: number; damage: number }[];
  /** Skill code / animation type (packet `+0x38`). 0 = basic auto-attack. */
  skillCode: number;
}

/** Server popup (0x105). */
export interface ParsedServerMessage {
  header: MPacketHeader;
  subtype: number;
  code: number;
}

/**
 * `entityId` is the target slot index (from header `clientId`, wire offset +0x06).
 * Wire `state`: `0` leave/reset (+0x234), `1` dying, `2` fade, `>= 3` hard evict.
 * Bot renderer: `0` and `>= 3` remove from store; `1`/`2` mark dying/fade.
 * (Canonical first-touch keep on `0` is intentionally not mirrored.)
 */
export interface ParsedMobDeathState {
  header: MPacketHeader;
  entityId: number;
  state: number;
}

/**
 * `subType==2` writes `entity+0x221 = 0` (REVIVE); `subType==1` is animation-only
 * (gated reads, no writes); `subType==3` is spawn FX. All subtypes re-stamp
 * presence; only sub==2 clears isDead in the renderer.
 */
export interface ParsedMobStateDelta {
  header: MPacketHeader;
  entityId: number;
  subType: number;
}

/**
 * Defensive landing: we only carry `entityId` (header `clientId`) and let the
 * renderer bump freshness — the next `0x364`/`0x36c` re-populates fields.
 */
export interface ParsedMobResync {
  header: MPacketHeader;
  entityId: number;
}

/** Server game message with type, code, and text payload. */
export interface ParsedGameMessageUnknown {
  header: MPacketHeader;
  type: number;
  code: number;
  message: string;
}

/** NPC Q&A dialog — question with 4 answer slots (0x1C6). */
export interface ParsedNpcMenuData {
  header: MPacketHeader;
  question: string;
  answers: [string, string, string, string];
}

/** NPC teleport command — server instructs client to teleport (0x1C1). */
export interface ParsedNpcTeleportCommand {
  header: MPacketHeader;
  categoryIndex: number;
  destinationIndex: number;
  extra: number;
}

/**
 * Per-slot delta update (0x182) — server pushes a 12-byte MItem update for one slot
 * in equipment, inventory, or appearance/affect arrays. Mount HP runtime updates
 * arrive as sub=0 slot=14. See and
 * for the broader flow.
 */
export interface ParsedSlotDeltaUpdate {
  header: MPacketHeader;
  /** 0=equipment, 1=inventory, 2=bank storage (cargo). */
  subType: number;
  /** Slot index within the array selected by subType. Signed s16 (server-side, NOT bounds-checked in game). */
  slotIndex: number;
  /** 12-byte MItem payload (itemId + 5 effects). */
  item: MItem;
}

/**
 * S2C `0x376` item-move echo — server confirmation of a two-slot move (canonical
 * swaps its own local structs). kind: 0=equip, 1=bag, 2=storage.
 */
export interface ParsedItemMoveEcho {
  header: MPacketHeader;
  dstKind: number;
  dstSlot: number;
  srcKind: number;
  srcSlot: number;
  bankerId: number;
}

/**
 *  @size 28 bytes (12 header + 16 body).
 *  Wire: discriminator(u16@+0x0C) + slot(i32@+0x10) + MItem(12B@+0x14).
 *  Gold branch: GetItemEffectValue(item,0x26)==2 → credit eff[0x24]*256+eff[0x25]. */
export interface ParsedTradeItemAdd {
  header: MPacketHeader;
  slot: number;
  item: MItem;
}

/** S2C `0x387`/`0x388` bank-gold delta echo (incoming).
 *  @size 16 bytes. amount u32 @ +0x0C.
 */
export interface ParsedBankGoldDelta {
  header: MPacketHeader;
  opcode: number;
  amount: number;
}

/** S2C `0x339` absolute bank-gold balance (set, not a delta). */
export interface ParsedBankGoldBalance {
  header: MPacketHeader;
  balance: number;
}

/**
 *  @size ~20 bytes. ctx(u16@+0x0C) + sub(i16@+0x0E) + slot(i16@+0x10).
 *  Canonical zeroes sold MItem + computes tiered gold payout into handGold. */
export interface ParsedSellResult {
  header: MPacketHeader;
  ctx: number;
  sub: number;
  slot: number;
}

export interface ParsedHandGoldUpdate {
  header: MPacketHeader;
  gold: number;
}

/**
 *  @size ~36 bytes. rowFlags[5](u8@+0x0C) + itemId(u8@+0x0D) + … + gold(u32@+0x20).
 *  Gold branch: itemId==0x0E → handGold += gold % 100_000_000. */
export interface ParsedTradeResult {
  header: MPacketHeader;
  itemId: number;
  gold: number;
}

/** S2C `0x17c` shop inventory — one item slot in the merchant panel (12 B). */
export interface ParsedShopItem {
  /** Item type ID (u16 @ item+0x00); 0 = empty slot. */
  itemId: number;
  /** Stack/price field (u16 @ item+0x02). */
  price: number;
  /** Zero-based slot index within the shop page (0..26). */
  slotIndex: number;
}

export interface ParsedShopInventory {
  header: MPacketHeader;
  /** 1 = open panel + items (344 B); 3 = items-only update. */
  subType: number;
  /** Up to 27 items × 12 B from +0x10. */
  items: ParsedShopItem[];
}

/** S2C `0x37f` relayed party-invite notification (inviter identity @body+8/+0xa). */
export interface ParsedPartyInviteNotify {
  header: MPacketHeader;
  inviterIndex: number;
  inviterName: string;
}

export interface ParsedPartyRosterMember {
  header: MPacketHeader;
  /** Member server charIndex (`body+8`). */
  charIndex: number;
  /** Member name (`body+0xa`, char[16]). */
  name: string;
  /** Leader flag (`body+1 == 0`). */
  isLeader: boolean;
}

/** S2C `0x3ea` party roster finalize/status — keyed by charIndex (`body+0`). */
export interface ParsedPartyRosterFinalize {
  header: MPacketHeader;
  charIndex: number;
}

/** S2C `0x37e` party leave/dissolve — charIndex of the leaver (`body+0`); `0` = dissolve. */
export interface ParsedPartyLeave {
  header: MPacketHeader;
  charIndex: number;
}
