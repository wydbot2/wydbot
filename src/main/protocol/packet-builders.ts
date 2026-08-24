import { PACKET_HEADER_SIZE, type MPosition } from '@shared/types/game-structures';
import type { ComposeWireIngredient } from '@shared/types/compose-types';
import type { DirectionCode } from '@shared/ipc/walkability';
import {
  OPCODE_ACCOUNT_LOGIN,
  OPCODE_TOKEN,
  OPCODE_REQUEST_MOB_LOGIN,
  OPCODE_MOVE,
  OPCODE_SINGLE_ATTACK,
  OPCODE_AOE_ATTACK,
  OPCODE_SKILL_ATTACK,
  OPCODE_CHAT_MESSAGE,
  OPCODE_WHISPER_MESSAGE,
  OPCODE_TELEPORT_CONFIRM,
  OPCODE_DIALOG_CLOSE,
  OPCODE_MINIPOPUP_SELECTION,
  OPCODE_NPC_CLICK,
  OPCODE_MINIPOPUP_CLICK,
  OPCODE_ITEM_DESTROY,
  OPCODE_COMPOSE_SUBMIT,
  OPCODE_ITEM_MOVE,
  OPCODE_USE_ITEM,
  OPCODE_USE_ITEM_ARM,
  OPCODE_PARTY_INVITE,
  OPCODE_PARTY_ACCEPT,
  OPCODE_PARTY_LEAVE,
  OPCODE_DIALOG_CLICK,
  OPCODE_SHOP_BUY,
  OPCODE_ZONE_PORTAL,
} from '@shared/constants/opcodes';
import { CLINE_VERSION_BASE } from '@shared/constants/network-basics';
import { SKILL_TYPE_REMAP_OFFSET, SKILL_TYPE_REMAP_THRESHOLD } from '@shared/constants/attack';
import { ITEM_CONTAINER, type ItemContainerKind } from '@shared/constants/item-definitions';
import { encodeShopWireSlot } from '@shared/lib/shop-slot';
import type { PacketSecurity } from './packet-security';
import { PacketWriter } from './packet-codec';

const MAX_MOVE_STEPS = 12;

/** ASCII '5' — center of numpad grid, used to encode direction offsets. */
const NUMPAD_CENTER = 0x35;

/**
 * @packet 0x20D AccountLogin (outgoing)
 * @size 124 bytes
 *
 * | Offset | Size | Field         | Wire Type |
 * |--------|------|---------------|-----------|
 * |      0 |   12 | Header        | —         |
 * |     12 |   12 | Password      | char[12]  |
 * |     24 |   16 | AccName       | char[16]  |
 * |     40 |   52 | Zero          | byte[52]  |
 * |     92 |    4 | ClientVersion | UInt32LE  |
 * |     96 |    4 | DBNeedSave    | Int32LE   |
 * |    100 |   16 | AdapterName   | byte[16]  |
 * |    116 |    6 | MAC           | byte[6]   |
 * |    122 |    2 | Pad           | byte[2]   |
 */
export const buildAccountLoginPacket = (
  security: PacketSecurity,
  username: string,
  password: string,
  clientVersion: number,
  adapterGuid: Buffer, // 16 bytes — WYD-encoded NIC GUID from getAdapterGuidBytes()
  mac: Buffer, // 6 bytes  — from getMacBytes()
): Buffer => {
  const w = new PacketWriter(124, security);
  w.writeHeader(OPCODE_ACCOUNT_LOGIN, 0);
  w.writeFixedString(password, 12);
  w.writeFixedString(username, 16);
  w.skip(52);
  w.writeUInt32(clientVersion);
  w.writeInt32(1); // DBNeedSave
  w.writeBytes(adapterGuid, 16);
  w.writeBytes(mac, 6);
  w.skip(2); // Pad
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0xFDE Token (outgoing)
 * @size 32 bytes
 *
 * | Offset | Size | Field      | Wire Type |
 * |--------|------|------------|-----------|
 * |      0 |   12 | Header     | —         |
 * |     12 |    6 | Password   | char[6] (4–6 digits; terminated by the next byte) |
 * |     18 |   10 | Unknown    | byte[10]  |
 * |     28 |    4 | IsChanging | Int32LE   |
 */
export const buildTokenPacket = (
  security: PacketSecurity,
  password: string,
  isChanging: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 6 + 10 + 4, security);
  w.writeHeader(OPCODE_TOKEN, 0);
  // Fill all 6 bytes (no reserved terminator) so a 6-digit pw isn't truncated.
  w.writeBytes(Buffer.from(password, 'ascii'), 6);
  w.skip(10);
  w.writeInt32(isChanging);
  w.finalizeHeader();
  return w.result;
};

/**
 * Obfuscated CLIVER for the 0x213 packet (see CLINE_VERSION_BASE for the formula).
 */
export const computeClineVersion = (shift: number): number =>
  (shift + (CLINE_VERSION_BASE << shift) * 10) >>> 0;

/** Rolls the per-login shift `s ∈ [1..9]`, mirroring the canonical `rand() % 9 + 1`. */
const randomClineShift = (): number => Math.floor(Math.random() * 9) + 1;

/**
 * @packet 0x213 RequestMobLogin (outgoing)
 * @size 36 bytes
 *
 * | Offset | Size | Field        | Wire Type |
 * |--------|------|--------------|-----------|
 * |      0 |   12 | Header       | —         |
 * |     12 |    4 | CharIndex    | Int32LE   |
 * |     16 |    4 | Reserved     | byte[4]   |
 * |     20 |    4 | ClineVersion | UInt32LE  |
 * |     24 |   12 | Padding      | byte[12]  |
 *
 * ClineVersion is recomputed per login (see computeClineVersion).
 */
export const buildRequestMobLoginPacket = (
  security: PacketSecurity,
  charIndex: number,
  clientId: number,
  shift: number = randomClineShift(),
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4 + 4 + 4 + 12, security);
  w.writeHeader(OPCODE_REQUEST_MOB_LOGIN, clientId);
  w.writeInt32(charIndex);
  w.skip(4);
  w.writeUInt32(computeClineVersion(shift));
  w.skip(12);
  w.finalizeHeader();
  return w.result;
};

/** Generates a 24-byte direction path buffer with mixed cardinal/diagonal steps. */
const buildDirectionPath = (from: MPosition, to: MPosition): Buffer => {
  const directionPath = Buffer.alloc(24, 0);
  let currentX = from.x;
  let currentY = from.y;
  let stepCount = 0;

  while (stepCount < MAX_MOVE_STEPS && (currentX !== to.x || currentY !== to.y)) {
    const deltaX = to.x - currentX;
    const deltaY = to.y - currentY;
    const signX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
    const signY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;

    let stepX: number;
    let stepY: number;

    if (signX !== 0 && signY !== 0) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        stepX = signX;
        stepY = Math.abs(deltaX) <= 2 * Math.abs(deltaY) ? signY : 0;
      } else {
        stepY = signY;
        stepX = Math.abs(deltaY) <= 2 * Math.abs(deltaX) ? signX : 0;
      }
    } else {
      stepX = signX;
      stepY = signY;
    }

    const directionCode = NUMPAD_CENTER + stepX + stepY * 3;
    directionPath[stepCount] = directionCode;
    currentX += stepX;
    currentY += stepY;
    stepCount++;
  }

  return directionPath;
};

/**
 * @packet 0x36C Move (outgoing)
 * @size 52 bytes
 *
 * | Offset | Size | Field        | Wire Type |
 * |--------|------|--------------|-----------|
 * |      0 |   12 | Header       | —         |
 * |     12 |    4 | LastPosition | MPosition |
 * |     16 |    4 | MoveType     | UInt32LE  |
 * |     20 |    4 | SpeedMove    | UInt32LE  |
 * |     24 |   24 | Command      | byte[24]  |
 * |     48 |    4 | Destiny      | MPosition |
 */
/**
 * Writes pre-validated direction codes (numpad 0x31..0x39) into a fresh
 * 24-byte buffer, capped at MAX_MOVE_STEPS=12 to match canonical
 */
const writeDirectionCodes = (codes: readonly DirectionCode[]): Buffer => {
  const directionPath = Buffer.alloc(24, 0);
  const n = Math.min(codes.length, MAX_MOVE_STEPS);
  for (let i = 0; i < n; i++) directionPath[i] = codes[i];
  return directionPath;
};

export const buildMovePacket = (
  security: PacketSecurity,
  clientId: number,
  lastPosition: MPosition,
  destiny: MPosition,
  moveType: number,
  speedMove: number,
  /**
   * Optional A*-validated per-tile direction codes. When
   * provided & non-empty, written directly — bypasses the naive straight-line
   * `buildDirectionPath` (which ignores walkability and causes server-side
   * path truncation). Empty / undefined falls back to straight-line for
   * legacy callers (e.g., user click-to-move from minimap).
   */
  directionCodes?: readonly DirectionCode[],
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4 + 4 + 4 + 24 + 4, security);
  w.writeHeader(OPCODE_MOVE, clientId);
  w.writePosition(lastPosition);
  w.writeUInt32(moveType);
  w.writeUInt32(speedMove);
  const dirBuf =
    directionCodes && directionCodes.length > 0
      ? writeDirectionCodes(directionCodes)
      : buildDirectionPath(lastPosition, destiny);
  w.writeBytes(dirBuf, 24);
  w.writePosition(destiny);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x39D BasicAttack (outgoing)
 * @size 72 bytes (0x48)
 *
 * | Offset | Size | Field          | Wire Type |
 * |--------|------|----------------|-----------|
 * |   0x00 |   12 | Header         | —         |
 * |   0x0C |   22 | (zeros)        | —         |
 * |   0x22 |    2 | SourcePosX     | UInt16LE  |
 * |   0x24 |    2 | SourcePosY     | UInt16LE  |
 * |   0x26 |    2 | TargetPosX     | UInt16LE  |
 * |   0x28 |    2 | TargetPosY     | UInt16LE  |
 * |   0x2A |    2 | SourceMobIndex | UInt16LE  |
 * |   0x2C |    2 | GlobalSlot     | UInt16LE  |
 * |   0x2E |    1 | AttackType     | UInt8 (4) |
 * |   0x2F |    2 | (zeros)        | —         |
 * |   0x31 |    1 | SkillFlags     | UInt8 (0) |
 * |   0x32 |    2 | (zeros)        | —         |
 * |   0x34 |    4 | SkillId        | Int32 (0) |
 * |   0x38 |    2 | WeaponSkillId  | Int16 (-1)|
 * |   0x3A |    2 | (zeros)        | —         |
 * |   0x3C |    2 | TargetMobIndex | UInt16LE  |
 * |   0x3E |    2 | (zeros)        | —         |
 * |   0x40 |    4 | TargetMarker   | Int32 (-2)|
 * |   0x44 |    4 | (zeros)        | —         |
 */
export const buildBasicAttackPacket = (
  security: PacketSecurity,
  clientId: number,
  attackerPosition: MPosition,
  targetPosition: MPosition,
  targetIndex: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 60, security);
  w.writeHeader(OPCODE_SINGLE_ATTACK, clientId);
  w.skip(22);
  w.writeUInt16(attackerPosition.x);
  w.writeUInt16(attackerPosition.y);
  w.writeUInt16(targetPosition.x);
  w.writeUInt16(targetPosition.y);
  w.writeUInt16(clientId);
  w.writeUInt16(0);
  w.writeUInt8(4);
  w.skip(2);
  w.writeUInt8(0);
  w.skip(2);
  w.writeInt32(0);
  w.writeInt16(-1);
  w.skip(2);
  w.writeUInt16(targetIndex);
  w.skip(2);
  w.writeInt32(-2);
  w.skip(4);
  w.finalizeHeader();
  return w.result;
};

export type SkillCastOpcode =
  | typeof OPCODE_SINGLE_ATTACK
  | typeof OPCODE_AOE_ATTACK
  | typeof OPCODE_SKILL_ATTACK;

/**
 * Resolve opcode + total wire size + max target slots from SkillData.packetKind.
 */
export const resolveSkillCastWire = (
  packetKind: number,
): { opcode: SkillCastOpcode; totalSize: number; maxSlots: number } => {
  if (packetKind === 1) {
    return { opcode: OPCODE_SINGLE_ATTACK, totalSize: 0x48, maxSlots: 1 };
  }
  if (packetKind === 2) {
    return { opcode: OPCODE_AOE_ATTACK, totalSize: 0x50, maxSlots: 2 };
  }
  const maxSlots = Math.min(13, Math.max(1, Math.floor(packetKind)));
  return { opcode: OPCODE_SKILL_ATTACK, totalSize: 0xa8, maxSlots };
};

/**
 * @packet 0x39D / 0x39E / 0x367 SkillCast (outgoing)
 * @size 72 (pk=1) / 80 (pk=2) / 168 (other)
 *
 * Same cast funnel as BasicAttack for the skill-cast sentinels (`+0x2E`=0xFF,
 * `+0x34`=-1). Target list lives at `+0x3C` stride 8:
 * `{ u16 targetId, u16 pad, i32 sentinel } × maxSlots`.
 *
 * | Offset | Size | Field          | Wire Type |
 * |--------|------|----------------|-----------|
 * |   0x00 |   12 | Header         | opcode by packetKind |
 * |   0x22 |    2 | SourcePosX     | UInt16LE  |
 * |   0x24 |    2 | SourcePosY     | UInt16LE  |
 * |   0x26 |    2 | TargetPosX     | UInt16LE  |
 * |   0x28 |    2 | TargetPosY     | UInt16LE  |
 * |   0x2A |    2 | SourceMobIndex | UInt16LE  |
 * |   0x2E |    1 | CastSentinel   | UInt8 0xFF |
 * |   0x31 |    1 | Reserved       | UInt8 0   |
 * |   0x34 |    4 | SkillMarker    | Int32 -1  |
 * |   0x38 |    2 | SkillType      | UInt16 (remapped if > threshold) |
 * |   0x3C |  8×N | Target slots   | see above |
 *
 * @param targetIndexes Primary first; extras are secondary multi-targets.
 * @param packetKind SkillData.packetKind (defaults to 1 = single-target 0x39D).
 */
export const buildSkillCastPacket = (
  security: PacketSecurity,
  clientId: number,
  attackerPosition: MPosition,
  targetPosition: MPosition,
  skillType: number,
  targetIndexes: readonly number[],
  packetKind: number = 1,
): Buffer => {
  const wireType =
    skillType > SKILL_TYPE_REMAP_THRESHOLD ? skillType + SKILL_TYPE_REMAP_OFFSET : skillType;
  const { opcode, totalSize, maxSlots } = resolveSkillCastWire(packetKind);
  const w = new PacketWriter(totalSize, security);
  w.writeHeader(opcode, clientId);
  w.skip(22);
  w.writeUInt16(attackerPosition.x);
  w.writeUInt16(attackerPosition.y);
  w.writeUInt16(targetPosition.x);
  w.writeUInt16(targetPosition.y);
  w.writeUInt16(clientId);
  w.writeUInt16(0);
  w.writeUInt8(0xff);
  w.skip(2);
  w.writeUInt8(0);
  w.skip(2);
  w.writeInt32(-1);
  w.writeUInt16(wireType);
  w.skip(2);
  // Target array @ +0x3C, stride 8. Empty slots stay zero (canonical zero-fill).
  for (let i = 0; i < maxSlots; i++) {
    const id = (targetIndexes[i] ?? 0) & 0xffff;
    w.writeUInt16(id);
    w.skip(2);
    w.writeInt32(id === 0 ? 0 : -1);
  }
  // Pad to totalSize (1 slot ends at +0x44 → pad 4 for 0x48; 2 slots → +0x4C pad 4; 13 → +0xA4 pad 4).
  const afterSlots = 0x3c + maxSlots * 8;
  if (afterSlots < totalSize) {
    w.skip(totalSize - afterSlots);
  }
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x367 GenericBuffCast (outgoing — self/no-target skill)
 * @size 168 bytes (0xA8)
 *
 * Same cast funnel as {@link buildSkillCastPacket} (`+0x2E`=0xFF discriminator,
 * `+0x34`=-1 marker, `+0x38`=skillType with the >0x68 → +0x5F remap) but the
 * generic 168-byte size for `packetKind != 1/2` skills, and the caster targets
 * itself (no enemy entity) — buff skills are self/no-target.
 *
 * | Offset | Size | Field          | Wire Type                   |
 * |--------|------|----------------|-----------------------------|
 * |   0x00 |   12 | Header         | —                           |
 * |   0x22 |    2 | SourcePosX     | UInt16LE                    |
 * |   0x24 |    2 | SourcePosY     | UInt16LE                    |
 * |   0x26 |    2 | TargetPosX     | UInt16LE (= source)         |
 * |   0x28 |    2 | TargetPosY     | UInt16LE (= source)         |
 * |   0x2A |    2 | SourceMobIndex | UInt16LE                    |
 * |   0x2E |    1 | CastSentinel   | UInt8 (0xFF)                |
 * |   0x31 |    1 | Reserved       | UInt8 (0)                   |
 * |   0x34 |    4 | SkillMarker    | Int32 (-1)                  |
 * |   0x38 |    2 | SkillType      | UInt16 (remapped if > 0x68) |
 * |   0x3C |    2 | TargetMobIndex | UInt16LE (= self)           |
 * |   0x40 |    4 | TargetSentinel | Int32 (-1)                  |
 * |   0x44 |  100 | (zeros)        | —                           |
 */
export const buildGenericBuffPacket = (
  security: PacketSecurity,
  clientId: number,
  attackerPosition: MPosition,
  skillType: number,
): Buffer => {
  const wireType =
    skillType > SKILL_TYPE_REMAP_THRESHOLD ? skillType + SKILL_TYPE_REMAP_OFFSET : skillType;
  const w = new PacketWriter(PACKET_HEADER_SIZE + 156, security);
  w.writeHeader(OPCODE_SKILL_ATTACK, clientId);
  w.skip(22);
  w.writeUInt16(attackerPosition.x);
  w.writeUInt16(attackerPosition.y);
  w.writeUInt16(attackerPosition.x); // self-target — buffs have no enemy entity
  w.writeUInt16(attackerPosition.y);
  w.writeUInt16(clientId);
  w.writeUInt16(0);
  w.writeUInt8(0xff);
  w.skip(2);
  w.writeUInt8(0);
  w.skip(2);
  w.writeInt32(-1);
  w.writeUInt16(wireType);
  w.skip(2);
  w.writeUInt16(clientId); // target = self
  w.skip(2);
  w.writeInt32(-1);
  w.skip(100); // 0x44..0xA7 — generic-skill buffer tail, all zero
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x333 ChatMessage (outgoing)
 * @size 140 bytes
 *
 * | Offset | Size | Field   | Wire Type |
 * |--------|------|---------|-----------|
 * |      0 |   12 | Header  | —         |
 * |     12 |  128 | Message | char[128] |
 */
export const buildChatMessagePacket = (
  security: PacketSecurity,
  clientId: number,
  message: string,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 128, security);
  w.writeHeader(OPCODE_CHAT_MESSAGE, clientId);
  w.writeFixedString(message, 128);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x334 WhisperMessage (outgoing)
 * @size 160 bytes
 *
 * | Offset | Size | Field   | Wire Type |
 * |--------|------|---------|-----------|
 * |      0 |   12 | Header  | —         |
 * |     12 |   16 | Command | char[16]  |
 * |     28 |  132 | Message | char[132] |
 */
export const buildWhisperMessagePacket = (
  security: PacketSecurity,
  clientId: number,
  command: string,
  message: string,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 16 + 132, security);
  w.writeHeader(OPCODE_WHISPER_MESSAGE, clientId);
  w.writeFixedString(command, 16);
  w.writeFixedString(message, 132);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet Generic signal (outgoing, header-only)
 * @size 12 bytes
 *
 * | Offset | Size | Field  | Wire Type |
 * |--------|------|--------|-----------|
 * |      0 |   12 | Header | —         |
 */
export const buildSignalPacket = (
  security: PacketSecurity,
  opcode: number,
  clientId: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE, security);
  w.writeHeader(opcode, clientId);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x2C2 TeleportConfirm (outgoing) — auto-relay of 0x1C1
 * @size 24 bytes
 *
 * Copies the 0x1C1 payload with opcode rewritten to 0x2C2.
 * Without this relay, the server ignores the teleport command.
 *
 * | Offset | Size | Field            | Wire Type |
 * |--------|------|------------------|-----------|
 * |      0 |   12 | Header           | —         |
 * |     12 |    4 | CategoryIndex    | Int32LE   |
 * |     16 |    4 | DestinationIndex | Int32LE   |
 * |     20 |    4 | Extra            | Int32LE   |
 */
export const buildTeleportConfirmPacket = (
  security: PacketSecurity,
  clientId: number,
  categoryIndex: number,
  destinationIndex: number,
  extra: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4 + 4 + 4, security);
  w.writeHeader(OPCODE_TELEPORT_CONFIRM, clientId);
  w.writeInt32(categoryIndex);
  w.writeInt32(destinationIndex);
  w.writeInt32(extra);
  w.finalizeHeader();
  return w.result;
};

/** @packet 0x384 DialogClose (outgoing, signal) — closes Q&A dialog */
export const buildDialogClosePacket = (security: PacketSecurity, clientId: number): Buffer =>
  buildSignalPacket(security, OPCODE_DIALOG_CLOSE, clientId);

/**
 * @packet 0x378 MiniPopupSelection (outgoing) — PLACEHOLDER
 * @size 32 bytes
 *
 * The real packet uses XOR obfuscation with session data (mob name, clientId).
 * This placeholder builds the structure but does NOT apply the obfuscation.
 *
 * | Offset | Size | Field     | Wire Type |
 * |--------|------|-----------|-----------|
 * |      0 |   12 | Header    | —         |
 * |     12 |   20 | Payload   | byte[20] (obfuscated) |
 */
export const buildMiniPopupSelectionPacket = (
  security: PacketSecurity,
  clientId: number,
  _buttonIndex: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 20, security);
  w.writeHeader(OPCODE_MINIPOPUP_SELECTION, clientId);
  // TODO: XOR obfuscation with mob name + clientId (not yet implemented)
  w.skip(20);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x2C7 MiniPopupClick (outgoing)
 * @size 16 bytes
 *
 * Sent when the player clicks a button in the NPC MiniPopup menu.
 * Unlike 0x378 (MiniPopupSelection), this packet has no XOR obfuscation.
 *
 * | Offset | Size | Field       | Wire Type |
 * |--------|------|-------------|-----------|
 * |   0x00 |   12 | Header      | —         |
 * |   0x0C |    2 | ButtonIndex | UInt16LE  |
 * |   0x0E |    2 | (padding)   | byte[2]   |
 */
export const buildMiniPopupClickPacket = (
  security: PacketSecurity,
  clientId: number,
  buttonIndex: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4, security); // 16 bytes total
  w.writeHeader(OPCODE_MINIPOPUP_CLICK, clientId);
  w.writeUInt16(buttonIndex);
  w.skip(2); // padding
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x28B NpcClick (outgoing)
 * @size 20 bytes
 *
 * | Offset | Size | Field        | Wire Type |
 * |--------|------|--------------|-----------|
 * |      0 |   12 | Header       | —         |
 * |     12 |    2 | TargetIndex  | UInt16LE  |
 * |     14 |    6 | (zeros)      | —         |
 */
export const buildNpcClickPacket = (
  security: PacketSecurity,
  clientId: number,
  targetMobIndex: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 8, security);
  w.writeHeader(OPCODE_NPC_CLICK, clientId);
  w.writeUInt16(targetMobIndex);
  w.skip(6);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x290 ZonePortal (outgoing)
 * @size 16 bytes
 *
 * | Offset | Size | Field   | Wire Type |
 * |--------|------|---------|-----------|
 * |  0x00  |   12 | Header  | —         |
 * |  0x0C  |    4 | (zeros) | byte[4]   |
 */
export const buildZonePortalPacket = (security: PacketSecurity, clientId: number): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4, security);
  w.writeHeader(OPCODE_ZONE_PORTAL, clientId);
  w.skip(4);
  w.finalizeHeader();
  return w.result;
};

export { ITEM_CONTAINER, type ItemContainerKind };

/**
 * @packet 0x376 item-MOVE sub-form — two-slot move between (kind, slot) cells (outgoing)
 * @size 20 bytes (0x14)
 *
 * Moves/merges an item between two `(kind, slot)` cells. `0x376` is a
 * multiplexed generic item-action. When src and dst hold the same stackable item
 * (dst occupied, not in the 0x373 allow-table) the server consolidates and
 * replies with `0x182` sub=1 ×2 (dst summed, src drained).
 *
 * Wire body is **DST-first** — opposite of the function-arg
 * order. `clientId` is the player's server-assigned id (`_mobIndex`); the
 * 0x182 reply header carries the same value (probe-verified equal).
 *
 * | Offset | Size | Field   | Wire Type |
 * |--------|------|---------|-----------|
 * |   0x00 |   12 | Header (incl. clientId @ +0x06) | — |
 * |   0x0C |    1 | DstKind | UInt8     |
 * |   0x0D |    1 | DstSlot | UInt8     |
 * |   0x0E |    1 | SrcKind | UInt8     |
 * |   0x0F |    1 | SrcSlot | UInt8     |
 */
export const buildItemMovePacket = (
  security: PacketSecurity,
  clientId: number,
  srcKind: ItemContainerKind,
  srcSlot: number,
  dstKind: ItemContainerKind,
  dstSlot: number,
  bankerId = 0,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 8, security);
  w.writeHeader(OPCODE_ITEM_MOVE, clientId);
  w.writeUInt8(dstKind); // +0x0C — canonical body is DST-first
  w.writeUInt8(dstSlot); // +0x0D
  w.writeUInt8(srcKind); // +0x0E
  w.writeUInt8(srcSlot); // +0x0F
  w.writeUInt32(bankerId);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x02E4 ItemDestroy — game discard (outgoing)
 * @size 20 bytes (12 header + 8 body)
 *   round-trip via `packet-security.ts` decrypt + re-encrypt.
 *
 * | Offset | Size | Field   | Wire Type                                  |
 * |--------|------|---------|--------------------------------------------|
 * |  0x00  |   12 | Header  | size + opcode=0x02E4 + clientId @+0x06     |
 * |  0x0C  |    4 | Slot    | UInt32LE  (bag slot index, 0..59)          |
 * |  0x10  |    4 | ItemId  | UInt32LE  (server cross-checks the pair)   |
 *
 * No VOLATILE-sum gate (equipment passes), no NPC sentinel, no player coords.
 * Server destroys the item directly — no ground spawn.
 */
export const buildItemDestroyPacket = (
  security: PacketSecurity,
  clientId: number,
  slot: number,
  itemId: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 8, security);
  w.writeHeader(OPCODE_ITEM_DESTROY, clientId);
  w.writeUInt32(slot);
  w.writeUInt32(itemId);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x37F PartyInvite (outgoing)
 * @size 44 bytes (12 header + 32 body)
 * See — Invite".
 *
 * | Offset | Size | Field            | Value                                    |
 * |--------|------|------------------|------------------------------------------|
 * |  0x00  |   12 | Header           | opcode=0x37F + clientId=self charIndex    |
 * |  0x0C  |    1 | Leader flag      | 0                                        |
 * |  0x0D  |    1 | Pad              | 0                                        |
 * |  0x0E  |    2 | Stat (class/lvl) | 0 (cosmetic in the relay)                 |
 * |  0x10  |    2 | Player X         | UInt16LE                                 |
 * |  0x12  |    2 | Player Y         | UInt16LE                                 |
 * |  0x14  |    2 | Self charIndex   | UInt16LE (= clientId)                     |
 * |  0x16  |   18 | Self name        | char[18]                                 |
 * |  0x28  |    2 | Target charIndex | UInt16LE (the invitee)                    |
 * |  0x2A  |    2 | Pad              | 0                                        |
 *
 * The server relays this to the target as an S2C 0x37f (invite popup). Only
 * self charIndex + target charIndex are load-bearing; the rest is display data.
 */
export const buildPartyInvitePacket = (
  security: PacketSecurity,
  clientId: number,
  targetIndex: number,
  selfName: string,
  pos: MPosition,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 32, security);
  w.writeHeader(OPCODE_PARTY_INVITE, clientId);
  w.writeUInt8(0); // leader flag
  w.writeUInt8(0); // pad
  w.writeUInt16(0); // stat (cosmetic)
  w.writeUInt16(pos.x);
  w.writeUInt16(pos.y);
  w.writeUInt16(clientId); // self charIndex
  w.writeFixedString(selfName, 18);
  w.writeUInt16(targetIndex);
  w.skip(2); // trailing pad
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x3AB PartyAccept (outgoing)
 * @size 32 bytes (12 header + 20 body)
 * See — Accept".
 *
 * | Offset | Size | Field             | Value                                   |
 * |--------|------|-------------------|-----------------------------------------|
 * |  0x00  |   12 | Header            | opcode=0x3AB + clientId=self charIndex   |
 * |  0x0C  |    2 | Inviter charIndex | UInt16LE                                |
 * |  0x0E  |   16 | Inviter name      | char[16]                                |
 * |  0x1E  |    2 | Pad               | 0                                       |
 */
export const buildPartyAcceptPacket = (
  security: PacketSecurity,
  clientId: number,
  inviterIndex: number,
  inviterName: string,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 20, security);
  w.writeHeader(OPCODE_PARTY_ACCEPT, clientId);
  w.writeUInt16(inviterIndex);
  w.writeFixedString(inviterName, 16);
  w.skip(2); // trailing pad
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x37E PartyLeave (outgoing)
 * @size 16 bytes (12 header + 4-byte zero body)
 * See — Leave / dissolve". clientId = self charIndex.
 */
export const buildPartyLeavePacket = (security: PacketSecurity, clientId: number): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4, security);
  w.writeHeader(OPCODE_PARTY_LEAVE, clientId);
  w.skip(4); // zero body
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x373 Form A USE-item (outgoing)
 * @size 36 bytes (0x24)
 * A wire body" +
 *   mount-system.md §"C2S 0x373 feed body".
 *
 * Discriminators (canonical):
 *   - USE-vs-MOVE is decided by the player coords at +0x1C/+0x1E being
 *     non-zero. THIS builder always stamps the coords ⇒ Form A USE.
 *   - +0x18 byte distinguishes feed-vs-potion: `0xE` for mount feed
 *     (category 0xF), `0` for potion/herb (categories 1, 0xF2, 0xF3).
 *
 * | Offset | Size | Field             | Wire Type / Value                          |
 * |--------|------|-------------------|--------------------------------------------|
 * |   0x00 |   12 | Header            | size/key/chksum + opcode=0x373 + clientId  |
 * |   0x0C |    4 | Form A marker     | UInt32LE = 1                               |
 * |   0x10 |    4 | Slot              | UInt32LE  (bag slot 0..59)                 |
 * |   0x14 |    4 | (padding)         | 0                                          |
 * |   0x18 |    4 | feed/cat marker   | UInt32LE = 0 (potion/herb) | 0xE (mount)   |
 * |   0x1C |    2 | Player X          | UInt16LE = ROUND(player.x)                 |
 * |   0x1E |    2 | Player Y          | UInt16LE = ROUND(player.y)                 |
 * |   0x20 |    4 | menu index        | UInt32LE = 0 (potion/herb/feed) | 1-based   |
 *                                       hunt-scroll destination index             |
 *
 * The wire does NOT carry `itemId` — the server reads server-side
 * `inventory[slot]` to know what was used. The renderer pre-validates
 * `inventory[slot].index === itemId` before issuing the USE_ITEM IPC.
 *
 * `destIndex` defaults to `0` so every potion/herb/feed caller is unchanged; a
 * hunt-scroll passes its 1-based `PotalPos` menu index here (the server resolves
 * `(item, index) → destination tile`).
 */
export const buildUseItemPacket = (
  security: PacketSecurity,
  clientId: number,
  slot: number,
  feedMarker: 0 | 0xe,
  playerPosition: MPosition,
  destIndex = 0,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 24, security);
  w.writeHeader(OPCODE_USE_ITEM, clientId);
  w.writeUInt32(1); // +0x0C Form A marker
  w.writeUInt32(slot); // +0x10
  w.skip(4); // +0x14 padding
  w.writeUInt32(feedMarker); // +0x18
  w.writeUInt16(playerPosition.x & 0xffff); // +0x1C (ROUND already applied: tile coords are int)
  w.writeUInt16(playerPosition.y & 0xffff); // +0x1E
  w.writeUInt32(destIndex >>> 0); // +0x20 hunt-scroll menu index (0 otherwise)
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x3AE channel-arm Mode=1 (outgoing)
 * @size 16 bytes (12 header + 4 body)
 *   (`PUSH 0x10`) with `+0x0C = 1`, then arms a ~5000 ms timer that flushes the
 * stashed 0x373. See flow".
 *
 * | Offset | Size | Field  | Wire Type                           |
 * |--------|------|--------|-------------------------------------|
 * |  0x00  |   12 | Header | size/key/chksum + opcode + clientId |
 * |  0x0C  |    4 | Mode   | UInt32LE = 1                        |
 */
export const buildUseItemArmPacket = (security: PacketSecurity, clientId: number): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4, security);
  w.writeHeader(OPCODE_USE_ITEM_ARM, clientId);
  w.writeUInt32(1); // +0x0C Mode=1
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x388 / 0x387 bank gold deposit / withdraw (outgoing)
 * @size 16 bytes (12 header + 4 body)
 *   confirm). Server echoes the same opcode, then S2C 0x339 (absolute balance).
 *
 * | Offset | Size | Field  | Wire Type                           |
 * |--------|------|--------|-------------------------------------|
 * |  0x00  |   12 | Header | size/key/chksum + opcode + clientId |
 * |  0x0C  |    4 | Amount | UInt32LE                            |
 *
 * `opcode` selects direction: OPCODE_BANK_GOLD_DEPOSIT (0x388) or OPCODE_BANK_GOLD_WITHDRAW (0x387).
 */
export const buildBankGoldPacket = (
  security: PacketSecurity,
  clientId: number,
  opcode: number,
  amount: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4, security);
  w.writeHeader(opcode, clientId);
  w.writeUInt32(amount); // +0x0C
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x2E7 composition submit — the Item-Mix panel OK (outgoing)
 * @size 120 bytes (12 header + 108 body)
 *   memsets the packet buffer and only writes itemId; the server reads the actual
 *   stack from the source bag-slot index (+0x70). Confirmed by a successful
 *   RaidMerchant compose (recipe 578, item 620 x2): MItem[0]={620, stack=0},
 *   server replied 0x182 consume + 0x105 code=450 ("Missão Concluída!").
 *
 * | Offset | Size | Field        | Wire Type                                   |
 * |--------|------|--------------|---------------------------------------------|
 * |  0x00  |   12 | Header       | size/key/chksum + opcode=0x2E7 + clientId   |
 * |  0x0C  |    4 | Recipe index | Int32LE                                     |
 * |  0x10  |   96 | Ingredients  | 8 × MItem: itemId u16 + stack(=0) u16 + 8 zero  |
 * |  0x70  |    8 | Bag slots    | 8 × UInt8 (source slot, 0xff = unused)      |
 */
export const buildComposeSubmitPacket = (
  security: PacketSecurity,
  clientId: number,
  recipeIndex: number,
  ingredients: readonly ComposeWireIngredient[],
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 108, security);
  w.writeHeader(OPCODE_COMPOSE_SUBMIT, clientId);
  w.writeInt32(recipeIndex); // +0x0C
  for (let i = 0; i < 8; i++) {
    const ing = ingredients[i];
    if (ing) {
      w.writeUInt16(ing.itemId); // MItem itemId
      w.writeUInt16(0); // MItem stack — always 0 (canonical memset; server reads from slot)
      w.skip(8); // effect bytes (zero)
    } else {
      w.skip(12); // empty MItem slot
    }
  }
  for (let i = 0; i < 8; i++) w.writeUInt8(ingredients[i]?.slot ?? 0xff); // +0x70 source bag slots
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x379 shop buy (outgoing)
 * @size 24 bytes (12 header + 12 body)
 *   ShopSlot argument is the **linear** 0x17C panel index (0..26); the builder
 *
 * | Offset | Size | Field      | Wire Type |
 * |--------|------|------------|-----------|
 * |  0x00  |   12 | Header     | —         |
 * |  0x0C  |    2 | NpcIndex   | UInt16LE  |
 * |  0x0E  |    2 | ShopSlot   | UInt16LE (encoded) |
 * |  0x10  |    2 | BagSlot    | UInt16LE  |
 * |  0x12  |    2 | (zero)     | UInt16LE  |
 * |  0x14  |    4 | (padding)  | UInt32LE  |
 */
export const buildShopBuyPacket = (
  security: PacketSecurity,
  clientId: number,
  npcIndex: number,
  shopSlot: number,
  bagSlot: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 12, security);
  w.writeHeader(OPCODE_SHOP_BUY, clientId);
  w.writeUInt16(npcIndex);
  w.writeUInt16(encodeShopWireSlot(shopSlot));
  w.writeUInt16(bagSlot);
  w.writeUInt16(0);
  w.writeUInt32(0);
  w.finalizeHeader();
  return w.result;
};

/**
 * @packet 0x27B dialog/quest/trainer NPC click (outgoing) — nibble-1 open.
 * @size 16 bytes (12 header + 4 body)
 *
 * | Offset | Size | Field      | Wire Type |
 * |--------|------|------------|-----------|
 * |  0x00  |   12 | Header     | —         |
 * |  0x0C  |    2 | NpcIndex   | UInt16LE  |
 * |  0x0E  |    2 | (zero)     | UInt16LE  |
 */
export const buildDialogClickPacket = (
  security: PacketSecurity,
  clientId: number,
  targetMobIndex: number,
): Buffer => {
  const w = new PacketWriter(PACKET_HEADER_SIZE + 4, security);
  w.writeHeader(OPCODE_DIALOG_CLICK, clientId);
  w.writeUInt16(targetMobIndex);
  w.writeUInt16(0);
  w.finalizeHeader();
  return w.result;
};
