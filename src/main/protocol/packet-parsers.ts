import type { MItem } from '@shared/types/item-types';
import type { MAffect, MAffectPacket } from '@shared/types/affect-types';
import { PACKET_HEADER_SIZE } from '@shared/types/game-structures';
import {
  BAG_UNLOCK_COUNT,
  BAG_UNLOCK_TOKEN_ID,
  MAXL_AFFECT,
  MAXL_AFFECT_WORLD,
  MAXL_CARGO_ITEM,
  MAXL_EQUIP,
  MAXL_INVENTORY,
} from '@shared/constants/game-basics';
import { EQUIP_SLOT_HELMET } from '@shared/constants/equip-slots';
import { protocolLogger } from '../logging';
import { PacketReader } from './packet-codec';
import type {
  ParsedLoginSuccessful,
  ParsedResendCharList,
  ParsedCharToWorld,
  ParsedCreateMob,
  ParsedMove,
  ParsedChatMessage,
  ParsedWhisperMessage,
  ParsedRefreshScore,
  ParsedCompactHpMpSync,
  ParsedDamageEvent,
  ParsedDespawnByObjectId,
  ParsedMobDeath,
  ParsedServerMessage,
  ParsedMobDeathState,
  ParsedMobStateDelta,
  ParsedMobResync,
  ParsedGameMessageUnknown,
  ParsedNpcMenuData,
  ParsedNpcTeleportCommand,
  ParsedSlotDeltaUpdate,
  ParsedItemMoveEcho,
  ParsedBankGoldBalance,
  ParsedPartyInviteNotify,
  ParsedPartyRosterMember,
  ParsedPartyRosterFinalize,
  ParsedPartyLeave,
  ParsedShopInventory,
  ParsedShopItem,
  ParsedSingleAttackInbound,
  ParsedTradeItemAdd,
  ParsedBankGoldDelta,
  ParsedSellResult,
  ParsedTradeResult,
  ParsedHandGoldUpdate,
} from './packet-types';

/**
 * @packet 0x10A LoginSuccessful (incoming)
 * @size 2808 bytes
 *
 * | Offset | Size | Field        | Wire Type            |
 * |--------|------|--------------|----------------------|
 * |      0 |   12 | Header       | —                    |
 * |     12 |   16 | HashKeyTable | byte[16]             |
 * |     28 |    4 | Offset28     | Int32LE              |
 * |     32 | 1208 | SelChar      | MSelChar             |
 * |   1240 | 1536 | Cargo        | MItem[128] (12 each) |
 * |   2776 |    4 | CargoCoin    | Int32LE              |
 * |   2780 |   16 | AccName      | char[16]             |
 * |   2796 |   12 | Keys         | byte[12]             |
 */
export const parseLoginSuccessfulPacket = (buffer: Buffer): ParsedLoginSuccessful => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const hashKeyTable = new Uint8Array(r.readBytes(16));
  const offset28 = r.readInt32();
  const selChar = r.readSelChar();

  const cargo: MItem[] = [];
  for (let i = 0; i < MAXL_CARGO_ITEM; i++) cargo.push(r.readItem());
  const cargoCoin = r.readInt32();
  const accName = r.readFixedString(16);
  const keys = new Uint8Array(r.readBytes(12));

  return { header, hashKeyTable, offset28, selChar, cargo, cargoCoin, accName, keys };
};

/**
 * @packet 0x110 ResendCharList (incoming)
 * @size 1224 bytes
 *
 * | Offset | Size | Field    | Wire Type |
 * |--------|------|----------|-----------|
 * |      0 |   12 | Header   | —         |
 * |     12 |    4 | Unknown4 | Int32LE   |
 * |     16 | 1208 | SelChar  | MSelChar  |
 */
export const parseResendCharListPacket = (buffer: Buffer): ParsedResendCharList => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const unknown4 = r.readInt32();
  const selChar = r.readSelChar();
  return { header, unknown4, selChar };
};

/**
 * @packet 0x114 CharToWorld (incoming)
 * @size 2104 bytes
 *
 * Payload: contiguous fields on pkt 16-1383 and 1696-2071, plus individually
 * copied fields: MobIndex, GameMode, SkillSlots, CP, ServerTime.
 *
 * ┌────────┬───────┬────────────────┬───────────────────────────────────┐
 * │ Offset │ Size  │ Field          │ Wire Type                         │
 * ├────────┼───────┼────────────────┼───────────────────────────────────┤
 * │      0 │    12 │ Header         │ MPacketHeader (size,op,cid,ts)    │
 * │     12 │     4 │ Position       │ MPosition (x:i16 + y:i16)         │
 * │     16 │    18 │ Name           │ char[18]                          │
 * │     34 │     2 │ GuildIndex     │ UInt16LE                          │
 * │     36 │     1 │ Class          │ UInt8 (0=TK,1=FM,2=BM,3=HT)       │
 * │     37 │     3 │ (unknown)      │ pad, ignored                      │
 * │     40 │     4 │ Gold           │ Int32LE                           │
 * │     44 │     4 │ (unknown)      │ ignored                           │
 * │     48 │     8 │ Exp            │ Int64LE                           │
 * │     56 │     4 │ PosXY          │ overwritten from header           │
 * │     60 │    48 │ BaseScore      │ MScore (48 bytes)                 │
 * │    108 │    48 │ FinalScore     │ MScore (48 bytes)                 │
 * │    156 │   216 │ Equip[18]      │ 18×MItem ([0]=body/class slot)    │
 * │    372 │   720 │ Inventory[60]  │ 60×MItem                          │
 * │   1092 │    48 │ (unknown)      │ server-only, ignored              │
 * │   1140 │     4 │ Learn[0]       │ UInt32LE (bit30=Celestial)        │
 * │   1144 │     4 │ Learn[1]       │ UInt32LE                          │
 * │   1148 │     2 │ StatusPoint    │ UInt16LE                          │
 * │   1150 │     2 │ CPPoint        │ UInt16LE                          │
 * │   1152 │     2 │ SkillPoint     │ UInt16LE                          │
 * │   1154 │     1 │ CriticalRate   │ UInt8 (×4/10=%)                   │
 * │   1155 │     1 │ SaveMana       │ UInt8 (%)                         │
 * │   1156 │     4 │ SkillBar[0]    │ UInt32LE                          │
 * │   1160 │     2 │ (unknown)      │ gap                               │
 * │   1162 │     2 │ AttackSpeed    │ Int16LE (+1000/10=%)              │
 * │   1164 │     2 │ CritDmgBonus   │ Int16LE (%d%%)                    │
 * │   1166 │     2 │ CritDmgReduc.  │ Int16LE (%d%%)                    │
 * │   1168 │   180 │ (unknown)      │ server-only, ignored              │
 * │   1348 │    22 │ (unknown)      │ ignored                           │
 * │   1370 │     2 │ Resist[0]      │ Int16LE (Fire?)                   │
 * │   1372 │     2 │ Resist[1]      │ Int16LE (Ice?)                    │
 * │   1374 │     2 │ Resist[2]      │ Int16LE                           │
 * │   1376 │     2 │ Resist[3]      │ Int16LE                           │
 * │   1378 │     6 │ (unknown)      │ ignored                           │
 * │   1384 │     2 │ (dead space)   │ padding                           │
 * │   1386 │     2 │ MobIndex       │ UInt16LE                          │
 * │   1388 │     2 │ GameMode       │ UInt16LE                          │
 * │   1390 │     4 │ SkillSlot[1]   │ UInt32LE (row 1, 4 skills)        │
 * │   1394 │     4 │ SkillSlot[2]   │ UInt32LE (row 2)                  │
 * │   1398 │     4 │ SkillSlot[3]   │ UInt32LE (row 3)                  │
 * │   1402 │     4 │ SkillSlot[4]   │ UInt32LE (row 4)                  │
 * │   1406 │     2 │ (dead space)   │ —                                 │
 * │   1408 │     4 │ CP             │ Int32LE (Contribution Points)     │
 * │   1412 │   284 │ (dead space)   │ ignored                           │
 * │   1696 │   376 │ Affects[47]    │ 47×MAffect (8 bytes each)         │
 * │   2072 │     4 │ (not copied)   │ —                                 │
 * │   2076 │     4 │ ServerTime     │ UInt32LE                          │
 * │   2080 │    24 │ (padding)      │ —                                 │
 * └────────┴───────┴────────────────┴───────────────────────────────────┘
 *
 * Equip[0] body/class encoding: value/10=bodyClass (0=TK,1=FM,2=BM,3=HT).
 * SkillSlot encoding: each byte < 0x18 (24) is relative → absolute = class*24 + relative.
 * SkillSlot[0] is the SkillBar[0] field above (pkt offset 1156).
 */
export const parseCharToWorldPacket = (buffer: Buffer): ParsedCharToWorld => {
  const r = new PacketReader(buffer);
  const header = r.readHeader(); // 0-11
  const position = r.readPosition(); // 12-15

  // === CHARACTER HEADER (pkt 16-59) ===
  const name = r.readFixedString(18); // 16-33
  const guildIndex = r.readUInt16(); // 34-35
  const charClass = r.readUInt8(); // 36
  r.skip(3); // 37-39 (unknown/pad)
  const gold = r.readInt32(); // 40-43
  r.skip(4); // 44-47 (unknown)
  const exp = r.readInt64(); // 48-55
  r.skip(4); // 56-59 (PosXY overwritten from header)

  // === SCORES (pkt 60-155) ===
  const baseScore = r.readScore(); // 60-107
  const finalScore = r.readScore(); // 108-155

  // === EQUIPMENT (pkt 156-371) ===
  // Equip[0] is body/class slot (not a real item)
  const equip = r.readEquip(); // 156-371 (18 × 12 = 216)

  // === INVENTORY (pkt 372-1091) ===
  const inventory: MItem[] = []; // 372-1091 (60 × 12 = 720)
  for (let i = 0; i < MAXL_INVENTORY; i++) inventory.push(r.readItem());

  // === BAG-UNLOCK TOKENS (pkt 1092-1115, 2 × 12-B MItem) ===
  const bagUnlock: boolean[] = [];
  for (let i = 0; i < BAG_UNLOCK_COUNT; i++) {
    bagUnlock.push(r.readItem().index === BAG_UNLOCK_TOKEN_ID);
  }
  r.skip(24); // 1116-1139 (remaining post-inventory, server-only)

  // === LEARNED SKILLS + STAT FIELDS (pkt 1140-1167) ===
  const learn0 = r.readUInt32(); // 1140-1143 (bit30=Celestial)
  const learn1 = r.readUInt32(); // 1144-1147
  const statusPoint = r.readUInt16(); // 1148-1149
  const cpPoint = r.readUInt16(); // 1150-1151 ("CPPoint")
  const skillPoint = r.readUInt16(); // 1152-1153
  const criticalRate = r.readUInt8(); // 1154     (×4/10=%)
  const saveMana = r.readUInt8(); // 1155
  const skillBar0Raw = r.readUInt32(); // 1156-1159
  r.skip(2); // 1160-1161 (gap)
  const attackSpeed = r.readInt16(); // 1162-1163 (+1000/10=%)
  const critDmgBonus = r.readInt16(); // 1164-1165 ("Dano Crítico Causado", %d%%)
  const critDmgReduction = r.readInt16(); // 1166-1167 ("Redução de Dano Crítico", %d%%)

  // === UNMAPPED GAP (pkt 1168-1347, 180 bytes) ===
  r.skip(180); // 1168-1347

  // === RESIST + TAIL (pkt 1348-1383) ===
  r.skip(22); // 1348-1369 (unknown, no xrefs)
  const resist0 = r.readInt16(); // 1370-1371
  const resist1 = r.readInt16(); // 1372-1373
  const resist2 = r.readInt16(); // 1374-1375
  const resist3 = r.readInt16(); // 1376-1377
  r.skip(6); // 1378-1383 (end of Block1)

  // === MID-GAP: Individual copies (pkt 1384-1695) ===
  r.skip(2); // 1384-1385 (dead space)
  const mobIndex = r.readUInt16(); // 1386-1387 (mob index)
  const gameMode = r.readUInt16(); // 1388-1389
  const skillSlot1 = r.readUInt32(); // 1390-1393
  const skillSlot2 = r.readUInt32(); // 1394-1397
  const skillSlot3 = r.readUInt32(); // 1398-1401
  const skillSlot4 = r.readUInt32(); // 1402-1405
  r.skip(2); // 1406-1407 (dead space)
  const cp = r.readInt32(); // 1408-1411
  r.skip(284); // 1412-1695 (dead space, client ignores)

  // === BLOCK2: Affects (pkt 1696-2071) ===
  const affects: MAffect[] = []; // 1696-2071 (47 × 8 = 376)
  for (let i = 0; i < MAXL_AFFECT_WORLD; i++) affects.push(r.readAffect());

  // === POST-BLOCK2 (pkt 2072-2103) ===
  r.skip(4); // 2072-2075 (not copied)
  const serverTime = r.readUInt32(); // 2076-2079
  // 2080-2103: unused tail/padding

  // === DERIVED: Evolution tier ===
  // pkt byte 165 (evolved flag)
  // pkt[1140] = learn0, bit 30 = Celestial flag
  const evolvedFlag = buffer.readUInt8(165);
  const isCelestial = (learn0 & 0x40000000) !== 0;
  const evolutionTier = evolvedFlag === 0 ? 0 : isCelestial ? 2 : 1;
  // 0=Mortal, 1=Arch, 2=Celestial

  const skillBar0 = skillBar0Raw; // SkillSlot[0] (Celestial bit is in learn0)

  const clientIndex = header.clientId;

  return {
    header,
    position,
    name,
    guildIndex,
    charClass,
    gold,
    exp,
    baseScore,
    finalScore,
    equip,
    inventory,
    bagUnlock,
    clientIndex,
    learnedSkill: [learn0, learn1],
    statusPoint,
    cpPoint,
    skillPoint,
    criticalRate,
    saveMana,
    attackSpeed,
    pvpDamage: critDmgBonus, // Block1 value, always 0; real pvpDamage comes via RefreshScore
    pvpDefense: critDmgReduction, // Block1 value, always 0; real pvpDefense comes via RefreshScore
    resist: [resist0, resist1, resist2, resist3],
    mobIndex,
    gameMode,
    skillSlots: [skillBar0, skillSlot1, skillSlot2, skillSlot3, skillSlot4],
    cp,
    affects,
    serverTime,
    evolutionTier,
  };
};

/**
 * @packet 0x364 CreateMob (incoming)
 * @size 256 bytes
 *
 * | Offset | Size | Field           | Wire Type                |
 * |--------|------|-----------------|--------------------------|
 * |      0 |   12 | Header          | —                        |
 * |     12 |    4 | Position        | MPosition                |
 * |     16 |    2 | Index           | UInt16LE                 |
 * |     18 |   16 | Name            | char[16]                 |
 * |     34 |   32 | Equipment[16]   | UInt16LE[16] (2 each)    |
 * |     66 |    4 | Unknown_01      | byte[4] (no reads found) |
 * |     70 |   64 | Affects         | MAffectPacket[32] (2 ea) |
 * |    134 |    2 | GuildIndex      | UInt16LE                 |
 * |    136 |    1 | GuildMemberType | UInt8                    |
 * |    137 |    3 | Unknown_02      | byte (0x89 pad + 0x8A word) |
 * |    140 |   48 | Score           | MScore (full, 48 bytes; base 0x8C) |
 * |    188 |    2 | Type            | UInt16LE & 0x7FFF (0xBC)  |
 * |    190 |   18 | AnctCode+extra  | byte[18] (skipped, 0xBE..0xCF) |
 * |    208 |   26 | Tab             | char[26]                 |
 * |    234 |   22 | Padding         | byte[22] (0xCC)          |
 */
export const parseCreateMobPacket = (buffer: Buffer): ParsedCreateMob => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const position = r.readPosition();
  const index = r.readUInt16();
  const name = r.readFixedString(16);

  const actionType = r.readUInt16();
  const items: number[] = [actionType];
  for (let i = 1; i < 16; i++) items.push(r.readUInt16());

  r.skip(4); // Unknown_01

  const affects: MAffectPacket[] = [];
  for (let i = 0; i < MAXL_AFFECT; i++) affects.push(r.readAffectPacket());

  const guildIndex = r.readUInt16();
  const guildMemberType = r.readUInt8();
  r.skip(3); // 0x89 pad + 0x8A-0x8B word → Score @0x8C
  const score = r.readScore();
  const type = r.readUInt16() & 0x7fff; // Type/state @0xBC
  r.skip(18); // AnctCode + equip-extra (0xBE..0xCF) → Tab @0xD0
  const tab = r.readFixedString(26);

  const mobClassNibble = buffer.readUInt8(0x98);
  // Compose-menu root key: 0x28 bytes into the Score region (packet+0x8C,
  // 48B) → packet+0xB4.
  // For Item-Mix NPCs (actionType 0x43) this selects which Missionitems group the
  // menu shows (e.g. Adventurer=36, Check In=50).
  const composeRoot = buffer.length >= 0xb6 ? buffer.readUInt16LE(0xb4) : 0;

  return {
    header,
    position,
    index,
    name,
    actionType,
    mobClassNibble,
    composeRoot,
    items,
    affects,
    guildIndex,
    guildMemberType,
    score,
    type,
    tab,
  };
};

/**
 * @packet 0x37F PartyInviteNotify (incoming) — the server-relayed invite.
 * Inviter charIndex @body+8, inviter name @body+0xa (char[18]).
 * See — Invite".
 */
export const parsePartyInviteNotifyPacket = (buffer: Buffer): ParsedPartyInviteNotify => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  r.skip(8); // body+0..+7
  const inviterIndex = r.readUInt16(); // body+8
  const inviterName = r.readFixedString(18); // body+0xa
  return { header, inviterIndex, inviterName };
};

/**
 * @packet 0x37D PartyRosterMember (incoming) — one member per sub-packet.
 * Leader flag @body+1 (0 ⇒ leader), charIndex @body+8, name @body+0xa (char[16]).
 * See — Roster member entry".
 */
export const parsePartyRosterMemberPacket = (buffer: Buffer): ParsedPartyRosterMember => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  r.skip(1); // body+0 (flag low byte)
  const isLeader = r.readUInt8() === 0; // body+1 (0 ⇒ leader)
  r.skip(6); // body+2..+7
  const charIndex = r.readUInt16(); // body+8
  const name = r.readFixedString(16); // body+0xa
  return { header, charIndex, name, isLeader };
};

/**
 * @packet 0x3EA PartyRosterFinalize (incoming) — charIndex @body+0.
 * See — Roster finalize".
 */
export const parsePartyRosterFinalizePacket = (buffer: Buffer): ParsedPartyRosterFinalize => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const charIndex = r.readUInt16(); // body+0
  return { header, charIndex };
};

/**
 * @packet 0x37E PartyLeave (incoming) — member-left / dissolve.
 * charIndex @body+0 (`0` = dissolve the whole party).
 * See — Leave / dissolve".
 */
export const parsePartyLeavePacket = (buffer: Buffer): ParsedPartyLeave => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const charIndex = r.readUInt16(); // body+0
  return { header, charIndex };
};

/**
 * @packet 0x36C Move (incoming)
 * @size 52 bytes
 *
 * | Offset | Size | Field        | Wire Type |
 * |--------|------|--------------|-----------|
 * |      0 |   12 | Header       | —         |
 * |     12 |    4 | LastPosition | MPosition |
 * |     16 |    4 | MoveType     | UInt32LE  |
 * |     20 |    4 | SpeedMove    | UInt32LE  |
 * |     24 |   24 | Command      | char[24]  |
 * |     48 |    4 | Destiny      | MPosition |
 */
export const parseMovePacket = (buffer: Buffer): ParsedMove => {
  const r = new PacketReader(buffer);
  return {
    header: r.readHeader(),
    lastPosition: r.readPosition(),
    moveType: r.readUInt32(),
    speedMove: r.readUInt32(),
    command: r.readFixedString(24),
    destiny: r.readPosition(),
  };
};

/**
 * @packet 0x333 ChatMessage (incoming)
 * @size 140 bytes
 *
 * | Offset | Size | Field   | Wire Type |
 * |--------|------|---------|-----------|
 * |      0 |   12 | Header  | —         |
 * |     12 |  128 | Message | char[128] |
 *
 * Message is null-terminated and padded with 0xFE bytes.
 */
export const parseChatMessagePacket = (buffer: Buffer): ParsedChatMessage => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const raw = buffer.subarray(12, 12 + 128);
  let end = raw.length;
  while (end > 0 && (raw[end - 1] === 0x00 || raw[end - 1] === 0xfe)) end--;
  const message = raw.subarray(0, end).toString('latin1');
  return { header, message };
};

/**
 * @packet 0x334 WhisperMessage (incoming)
 * @size 160 bytes
 *
 * | Offset | Size | Field   | Wire Type |
 * |--------|------|---------|-----------|
 * |      0 |   12 | Header  | —         |
 * |     12 |   16 | Command | char[16]  |
 * |     28 |  132 | Message | char[132] |
 */
export const parseWhisperMessagePacket = (buffer: Buffer): ParsedWhisperMessage => {
  const r = new PacketReader(buffer);
  return {
    header: r.readHeader(),
    command: r.readFixedString(16),
    message: r.readFixedString(132),
  };
};

/**
 * @size 172 bytes
 *
 * All offsets below are ABSOLUTE (pkt+0), not relative to body.
 *
 * | Abs  | Pkt+  | Size | Field              | Wire Type         | Scope |
 * |------|-------|------|--------------------|-------------------|-------|
 * |    0 | 0x00  |   12 | Header             | —                 | —     |
 * |   12 | 0x0C  |   48 | Score              | MScore (48B)      | ALL   |
 * |   60 | 0x3C  |    1 | CriticalRate       | UInt8             | LOCAL |
 * |   61 | 0x3D  |    1 | SaveMana           | UInt8             | LOCAL |
 * |   62 | 0x3E  |   64 | Affects            | u16[32]           | ALL   |
 * |  126 | 0x7E  |    2 | TransformID        | UInt16LE          | ALL   |
 * |  130 | 0x82  |    4 | Resistances 1+2    | UInt32LE          | LOCAL |
 * |  134 | 0x86  |    4 | Resistances 3+4    | UInt32LE          | LOCAL |
 * |  138 | 0x8A  |    2 | (not read)         | —                 | —     |
 * |  140 | 0x8C  |    4 | CurrentHp          | Int32LE           | LOCAL |
 * |  144 | 0x90  |    4 | CurrentMp          | Int32LE           | LOCAL |
 * |  148 | 0x94  |    2 | MagicIncrement     | UInt16LE          | LOCAL |
 * |  150 | 0x96  |    2 | (not read)         | —                 | —     |
 * |  152 | 0x98  |    1 | (flag)             | UInt8             | ALL   |
 * |  153 | 0x99  |    1 | (not read)         | —                 | —     |
 * |  154 | 0x9A  |    2 | Penetration        | Int16LE [%d]      | ALL   |
 * |  156 | 0x9C  |    2 | Absorption         | Int16LE [%d]      | ALL   |
 * |  158 | 0x9E  |    2 | CritDmgBonus       | Int16LE [%d.%d%%] | ALL   |
 * |  160 | 0xA0  |    2 | CritDmgReduction   | Int16LE [%d.%d%%] | ALL   |
 * |  162 | 0xA2  |    2 | Accuracy           | Int16LE [%d.%d%%] | ALL   |
 * |  164 | 0xA4  |    2 | Evasion            | Int16LE [%d.%d%%] | ALL   |
 * |  166 | 0xA6  |    2 | AttackSpeed        | Int16LE           | LOCAL |
 * |  168 | 0xA8  |    2 | PvpDamage          | Int16LE [%d%%]    | LOCAL |
 * |  170 | 0xAA  |    2 | PvpDefense         | Int16LE [%d%%]    | LOCAL |
 *
 * Scope: ALL = written for all entities; LOCAL = local player only
 */
export const parseRefreshScorePacket = (buffer: Buffer): ParsedRefreshScore => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const score = r.readScore(); // 12-59  (48B MScore)
  const criticalRate = r.readUInt8(); // 60     (LOCAL)
  const saveMana = r.readUInt8(); // 61     (LOCAL)

  const affects: MAffectPacket[] = []; // 62-125 (32×u16 = 64B)
  for (let i = 0; i < MAXL_AFFECT; i++) affects.push(r.readAffectPacket());

  const transformId = r.readUInt16(); // 126-127 (mount/visual)
  r.skip(2); // 128-129 healthBarPercent (u8 efetivo, 0-150, cor da barra HP, visual)
  r.skip(4); // 130-133 resistances 1+2 packed (2×i16, dead write — never read)
  r.skip(4); // 134-137 resistances 3+4 packed (2×i16, dead write — never read)
  r.skip(2); // 138-139 padding (NOT READ)
  const currentHp = r.readInt32(); // 140-143 (LOCAL)
  const currentMp = r.readInt32(); // 144-147 (LOCAL)
  const magicIncrement = r.readUInt16(); // 148-149 (LOCAL, MagicIncrement)
  r.skip(2); // 150-151 padding (NOT READ)
  r.skip(1); // 152     visualAuraType (u8 enum 0-3, aura visual por classe, ALL)
  r.skip(1); // 153     padding (NOT READ)

  // PvpDamage/PvpDefense display format %d.%d%% (193 → 19.3%).
  const penetration = r.readInt16(); // 154-155 (%d)
  const absorption = r.readInt16(); // 156-157 (%d)
  const pvpDamage = r.readInt16(); // 158-159 (%d.%d%%)
  const pvpDefense = r.readInt16(); // 160-161 (%d.%d%%)
  const accuracy = r.readInt16(); // 162-163 (%d.%d%%)
  const evasion = r.readInt16(); // 164-165 (%d.%d%%)
  const attackSpeed = r.readInt16(); // 166-167 (LOCAL)
  const critDamageBonus = r.readInt16(); // 168-169 (LOCAL, "Dano Crítico Causado", %d%%)
  const critDamageReduction = r.readInt16(); // 170-171 (LOCAL, "Redução de Dano Crítico", %d%%)

  return {
    header,
    score,
    criticalRate,
    saveMana,
    affects,
    transformId,
    currentHp,
    currentMp,
    magicIncrement,
    accuracy,
    evasion,
    penetration,
    absorption,
    critDamageBonus,
    critDamageReduction,
    attackSpeed,
    pvpDamage,
    pvpDefense,
  };
};

/**
 * @size 20 bytes
 *
 * | Pkt+ | Size | Field | Wire Type |
 * |------|------|-------|-----------|
 * | 0x00 |   12 | Header| —         |
 * | 0x0C |    4 | CurHp | Int32LE   |
 * | 0x10 |    4 | CurMp | Int32LE   |
 */
export const parseCompactHpMpSyncPacket = (buffer: Buffer): ParsedCompactHpMpSync => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const currHp = r.readInt32(); // +0x0C
  const currMp = r.readInt32(); // +0x10
  return { header, currHp, currMp };
};

/**
 * @size 20 bytes
 *
 * `CurHp`@+0x0C is the absolute post-hit HP; `+0x10` is the floating damage
 * popup amount (not stored — we render no floating text).
 */
export const parseDamageEventPacket = (buffer: Buffer): ParsedDamageEvent => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const currHp = r.readInt32(); // +0x0C
  return { header, currHp };
};

/**
 * @size 16 bytes
 *
 * `ObjectId`@+0x0C → ObjectManager soft-despawn (`obj+0x14=1`).
 */
export const parseDespawnByObjectIdPacket = (buffer: Buffer): ParsedDespawnByObjectId => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const objectId = r.readUInt16(); // +0x0C
  return { header, objectId };
};

/**
 * @packet 0x338 MobDeath (incoming)
 * @size 32 bytes
 *
 * | Offset | Size | Field   | Wire Type |
 * |--------|------|---------|-----------|
 * |      0 |   12 | Header  | —         |
 * |     12 |    4 | Hold    | Int32LE   |
 * |     16 |    2 | Killed  | UInt16LE  |
 * |     18 |    2 | Killer  | UInt16LE  |
 * |     20 |    4 | Unknown | byte[4]   |
 * |     24 |    8 | Exp     | Int64LE   |
 */
export const parseMobDeathPacket = (buffer: Buffer): ParsedMobDeath => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const hold = r.readInt32();
  const killed = r.readUInt16();
  const killer = r.readUInt16();
  r.skip(4); // Unknown
  const exp = r.readInt64();
  return { header, hold, killed, killer, exp };
};

/**
 * @packet 0x39D / 0x39E single/AoE attack (incoming damage event)
 * @size 72 bytes (0x39D) or 80 bytes (0x39E)
 *           +0x30 flags, +0x38 skillCode. Header carries sender (attacker).
 *
 * The game uses this packet to decrement `target+0x740` (currHp)
 * by a skill-derived damage value. Our renderer applies a best-effort
 * heuristic (see world-bridge.ts).
 */
export const parseSingleAttackInboundPacket = (
  buffer: Buffer,
  maxTargets: number,
): ParsedSingleAttackInbound => {
  const r = new PacketReader(buffer);
  const header = r.readHeader(); // clientId at +6 mirrors attacker id at +0x2a
  const skillCode = buffer.length >= 0x3a ? buffer.readUInt16LE(0x38) : 0;
  const targets: { targetIndex: number; damage: number }[] = [];
  for (let i = 0; i < maxTargets; i++) {
    const off = 0x3c + i * 8;
    if (off + 8 > buffer.length) break;
    const targetIndex = buffer.readUInt16LE(off);
    const damage = buffer.readInt32LE(off + 4);
    if (targetIndex === 0 || damage === -2) continue; // empty/sentinel slot — skip, keep scanning
    targets.push({ targetIndex, damage });
  }
  return { header, attackerIndex: header.clientId, targets, skillCode };
};

/**
 * @packet 0x105 ServerMessage (incoming)
 * @size 16 bytes
 *
 * | Offset | Size | Field    | Wire Type |
 * |--------|------|----------|-----------|
 * |      0 |   12 | Header   | —         |
 * |     12 |    1 | Subtype  | UInt8     |
 * |     13 |    1 | Reserved | UInt8     |
 * |     14 |    2 | Code     | Int16LE   |
 */
export const parseServerMessagePacket = (buffer: Buffer): ParsedServerMessage => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const subtype = r.readUInt8();
  r.skip(1);
  const code = r.readInt16();
  return { header, subtype, code };
};

/**
 * @packet Generic signal value (incoming)
 * @size 16 bytes
 *
 * | Offset | Size | Field    | Wire Type |
 * |--------|------|----------|-----------|
 * |      0 |   12 | Header   | —         |
 * |     12 |    4 | State    | Int32LE   |
 *
 * Header `clientId` (offset +0x06) carries the target slot index.
 * Payload state values: `0` alive, `1` dying, `2` fade, `>= 3` immediate evict.
 */
export const parseMobDeathStatePacket = (buffer: Buffer): ParsedMobDeathState => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const state = r.readInt32();
  return { header, entityId: header.clientId, state };
};

/**
 * @packet `0x36A` MobStateDelta (incoming)
 * @size 20 bytes (canonical)
 *
 * Per-entity ~1 Hz state-delta heartbeat. `subType==2` writes `+0x221 = 0`
 * (REVIVE — clears isDead). `subType==1` is death-grace animation; `subType==3`
 * is spawn FX. All subtypes are forwarded: the renderer re-stamps presence
 * (`lastSeenMs`); only sub==2 clears death state.
 *
 * | Offset | Size | Field    | Wire Type |
 * |--------|------|----------|-----------|
 * |      0 |   12 | Header   | —         |
 * |     12 |    4 | actionCode (skipped) | UInt32LE |
 * |     14 |    2 | SubType  | Int16LE   |
 *
 * Header `clientId` (offset +0x06) carries the target slot index.
 */
export const parseMobStateDeltaPacket = (buffer: Buffer): ParsedMobStateDelta => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  r.skip(2); // +0x0c..+0x0d actionCode low (we ignore — sub==1/3 not consumed)
  const subType = r.readInt16();
  return { header, entityId: header.clientId, subType };
};

/**
 * @packet `0x36B` MobResync (incoming)
 * @size 88 bytes (canonical)
 *
 * Full state+appearance resync (morph/respawn/polymorph). Canonical reloads
 * the next `0x364`/`0x36c` to repopulate visible fields.
 */
export const parseMobResyncPacket = (buffer: Buffer): ParsedMobResync => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  return { header, entityId: header.clientId };
};

/**
 * @packet 0x106 GameMessageUnknown (incoming)
 * @size 144 bytes
 *
 * | Offset | Size | Field   | Wire Type |
 * |--------|------|---------|-----------|
 * |      0 |   12 | Header  | —         |
 * |     12 |    2 | Type    | UInt16LE  |
 * |     14 |    2 | Code    | UInt16LE  |
 * |     16 |  128 | Message | char[128] |
 */
export const parseGameMessageUnknownPacket = (buffer: Buffer): ParsedGameMessageUnknown => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const type = r.readUInt16();
  const code = r.readUInt16();
  const raw = buffer.subarray(16, 16 + 128);
  let end = raw.length;
  while (end > 0 && (raw[end - 1] === 0x00 || raw[end - 1] === 0xfe)) end--;
  const message = raw.subarray(0, end).toString('latin1');
  return { header, type, code, message };
};

/**
 * @packet 0x1C6 NpcMenuData (incoming) — Q&A Dialog
 * @size 268 bytes
 *
 * | Offset | Size | Field     | Wire Type |
 * |--------|------|-----------|-----------|
 * |      0 |   12 | Header    | —         |
 * |     12 |  128 | Question  | char[128] |
 * |    140 |   32 | Answer[0] | char[32]  |
 * |    172 |   32 | Answer[1] | char[32]  |
 * |    204 |   32 | Answer[2] | char[32]  |
 * |    236 |   32 | Answer[3] | char[32]  |
 */
export const parseNpcMenuDataPacket = (buffer: Buffer): ParsedNpcMenuData => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const question = r.readFixedString(128);
  const answers: [string, string, string, string] = [
    r.readFixedString(32),
    r.readFixedString(32),
    r.readFixedString(32),
    r.readFixedString(32),
  ];
  return { header, question, answers };
};

/**
 * @packet 0x1C1 NpcTeleportCommand (incoming)
 * @size 24 bytes
 *
 * | Offset | Size | Field            | Wire Type |
 * |--------|------|------------------|-----------|
 * |      0 |   12 | Header           | —         |
 * |     12 |    4 | CategoryIndex    | Int32LE   |
 * |     16 |    4 | DestinationIndex | Int32LE   |
 * |     20 |    4 | Extra            | Int32LE   |
 */
export const parseNpcTeleportCommandPacket = (buffer: Buffer): ParsedNpcTeleportCommand => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const categoryIndex = Math.max(0, Math.min(99, r.readInt32()));
  const destinationIndex = r.readInt32();
  const extra = r.readInt32();
  return { header, categoryIndex, destinationIndex, extra };
};

/**
 * @size 28 bytes
 *
 * Per-slot delta update with 3 sub-types:
 *   sub=0 (equipment) → entity + 0xB48 + slot*12  (slot 14 = mount)
 *   sub=1 (inventory) → entity + 0xC20 + slot*12
 *   sub=2 (appearance) → entity + (slot*3 + 0x12F)*4  (semantics TBD)
 *
 * | Pkt+  | Size | Field      | Wire Type        |
 * |-------|------|------------|------------------|
 * | 0x00  |   12 | Header     | —                |
 * | 0x0C  |    2 | SubType    | UInt16LE         |
 * | 0x0E  |    2 | SlotIndex  | Int16LE (signed) |
 * | 0x10  |   12 | MItem      | UInt16 + 5×u8u8  |
 *
 * MItem layout for mount (sub=0 slot=14):
 *   bytes 0-1   itemId
 *   bytes 6-7   MOUNTHP (current HP)
 *   byte  8     MOUNTREFINE (multiplier index, NOT level)
 *   byte  9     MOUNTLIFE (vitalidade)
 *   byte  10    MOUNTFEED
 *   byte  11    MOUNTKILL
 */
export const parseSlotDeltaUpdatePacket = (buffer: Buffer): ParsedSlotDeltaUpdate => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const subType = r.readUInt16();
  const rawSlotIndex = r.readInt16();
  const item = r.readItem();

  const slotIndex = isValidSlot(subType, rawSlotIndex)
    ? rawSlotIndex
    : (protocolLogger.warn(
        `0x182 SlotDeltaUpdate: slotIndex ${rawSlotIndex} invalid for subType ${subType} — sentinel -1`,
      ),
      -1);

  return { header, subType, slotIndex, item };
};

const isValidSlot = (subType: number, slot: number): boolean => {
  if (slot < 0) return false;
  if (subType === 0) return slot >= EQUIP_SLOT_HELMET && slot < MAXL_EQUIP;
  if (subType === 1) return slot < MAXL_INVENTORY;
  return true;
};

/**
 * @size 20 bytes. Body DST-first `{dstKind@+0x0C, dstSlot@+0x0D, srcKind@+0x0E, srcSlot@+0x0F, bankerId u32@+0x10}`.
 * No item bytes — the client swaps its own local structs at the two (kind,slot) pairs.
 */
export const parseItemMoveEchoPacket = (buffer: Buffer): ParsedItemMoveEcho => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const dstKind = r.readUInt8();
  const dstSlot = r.readUInt8();
  const srcKind = r.readUInt8();
  const srcSlot = r.readUInt8();
  const bankerId = r.readUInt32();
  return { header, dstKind, dstSlot, srcKind, srcSlot, bankerId };
};

export const parseBankGoldBalancePacket = (buffer: Buffer): ParsedBankGoldBalance => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const balance = r.readUInt32();
  return { header, balance };
};

/**
 * @size 28 bytes
 *
 * | Offset | Size | Field         | Wire Type |
 * |--------|------|---------------|-----------|
 * |      0 |   12 | Header        | —         |
 * |     12 |    2 | discriminator | UInt16LE  |
 * |     14 |    4 | slot          | Int32LE   |
 * |     18 |   12 | MItem         | u16+i16+u16+3×{u8,u8} |
 *
 * Gold detection (renderer-side via ItemDb):
 *   GetItemEffectValue(item, 0x26) == 2 → handGold += eff[0x24]*256 + eff[0x25].
 * Normal items: inventory[slot] = enriched MItem.
 */
export const parseTradeItemAddPacket = (buffer: Buffer): ParsedTradeItemAdd => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  r.skip(2);
  const slot = r.readInt32();
  const item = r.readItem();
  return { header, slot, item };
};

/**
 * @packet 0x387 / 0x388 bank-gold delta echo (incoming)
 * @size 16 bytes
 *
 * | Offset | Size | Field  | Wire Type |
 * |--------|------|--------|-----------|
 * |      0 |   12 | Header | —         |
 * |     12 |    4 | amount | UInt32LE  |
 *
 * 0x387 (withdraw): handGold += amount, bankGold -= amount.
 * 0x388 (deposit):  handGold -= amount, bankGold += amount.
 */
export const parseBankGoldDeltaPacket = (buffer: Buffer, opcode: number): ParsedBankGoldDelta => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const amount = r.readUInt32();
  return { header, opcode, amount };
};

/**
 * @size 20 bytes
 *
 * | Offset | Size | Field | Wire Type |
 * |--------|------|-------|-----------|
 * |      0 |   12 | Header| —         |
 * |     12 |    2 | ctx   | UInt16LE  |
 * |     14 |    2 | sub   | Int16LE   |
 * |     16 |    2 | slot  | Int16LE   |
 *
 * Canonical: zeroes sold MItem, computes tiered payout
 * (<10k keep, 10k..9999 ×2/3, ≥10000 ÷2) into handGold.
 */
export const parseSellResultPacket = (buffer: Buffer): ParsedSellResult => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const ctx = r.readUInt16();
  const sub = r.readInt16();
  const slot = r.readInt16();
  return { header, ctx, sub, slot };
};

/**
 * @size 36 bytes
 *
 * | Offset | Size | Field    | Wire Type |
 * |--------|------|----------|-----------|
 * |      0 |   12 | Header   | —         |
 * |     12 |    5 | rowFlags | UInt8[5]  |
 * |     13 |    1 | itemId   | UInt8     |
 * |     14 |   18 | …        | UInt8[18] |
 * |     32 |    4 | gold     | UInt32LE  |
 *
 * Gold branch: itemId@+0x0D == 0x0E → handGold += gold % 100_000_000.
 */
export const parseTradeResultPacket = (buffer: Buffer): ParsedTradeResult => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  r.skip(1);
  const itemId = r.readUInt8();
  r.skip(18);
  const gold = r.readUInt32();
  return { header, itemId, gold };
};

/**
 * @size 16 bytes
 *
 * | Offset | Size | Field  | Wire Type |
 * |--------|------|--------|-----------|
 * |      0 |   12 | Header | —         |
 * |     12 |    4 | gold   | UInt32LE  |
 *
 * Fired after shop buy AND after MobDeath loot.
 */
export const parseHandGoldUpdatePacket = (buffer: Buffer): ParsedHandGoldUpdate => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const gold = r.readUInt32();
  return { header, gold };
};

/**
 * @size 344 bytes (sub-type 1): 12 header + 4 subType + 27×12 item + 4 trailing.
 *   subType 1 = open panel + items; subType 3 = items-only update.
 *   Per item 12 B: itemId u16 @+0x00, stack/price u16 @+0x02, 8 zero bytes.
 *   Empty slots (itemId 0) are skipped; `slotIndex` is the linear 0..26 index.
 *
 * | Offset | Size | Field     | Wire Type |
 * |--------|------|-----------|-----------|
 * |  0x00  |   12 | Header    | —         |
 * |  0x0C  |    4 | SubType   | UInt32LE  |
 * |  0x10  |  324 | Items[27] | 27 × 12 B |
 * | 0x154  |    4 | Trailing  | UInt32LE  |
 */
const SHOP_ITEM_COUNT = 27;
const SHOP_ITEM_SIZE = 12;

export const parseShopInventoryPacket = (buffer: Buffer): ParsedShopInventory => {
  const r = new PacketReader(buffer);
  const header = r.readHeader();
  const subType = r.readUInt32();

  const items: ParsedShopItem[] = [];
  for (let i = 0; i < SHOP_ITEM_COUNT; i++) {
    const itemOffset = PACKET_HEADER_SIZE + 4 + i * SHOP_ITEM_SIZE;
    if (buffer.length < itemOffset + SHOP_ITEM_SIZE) break;
    const itemId = buffer.readUInt16LE(itemOffset);
    if (itemId === 0) continue;
    const price = buffer.readUInt16LE(itemOffset + 2);
    items.push({ itemId, price, slotIndex: i });
  }

  return { header, subType, items };
};
