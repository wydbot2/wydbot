/**
 * BRIDGE: Server → Main Process (TCP → EventEmitter)
 *
 * Orchestrates TcpClient + PacketSecurity, dispatches incoming packets
 * through parsers, and emits typed events consumed by the session layer.
 *
 *   tcp.on('packet', ...)         ← TCP frame     (raw bytes, decrypted)
 *   this.emit('loginSuccessful')  → EventEmitter   (typed, parsed)
 */
import { EventEmitter } from 'events';
import type { Socket } from 'net';
import {
  OPCODE_LOGIN_SUCCESSFUL,
  OPCODE_TOKEN,
  OPCODE_TOKEN_INCORRECT,
  OPCODE_RESEND_CHAR_LIST,
  OPCODE_CHAR_TO_WORLD,
  OPCODE_CLIENT_MESSAGE_TEXT,
  OPCODE_CREATE_MOB,
  OPCODE_CREATE_MOB_NAMED,
  OPCODE_CHAR_LOGOUT_SIGNAL,
  OPCODE_MOB_DEATH_STATE,
  OPCODE_MOB_STATE_DELTA,
  OPCODE_MOB_RESYNC,
  OPCODE_SERVER_MULTI_SIGNAL,
  OPCODE_COMPACT_HP_MP_SYNC,
  OPCODE_DAMAGE_EVENT,
  OPCODE_DESPAWN_BY_OBJECT_ID,
  OPCODE_SLOT_DELTA_UPDATE,
  OPCODE_CHAT_MESSAGE,
  OPCODE_MOVE,
  OPCODE_MOVE_RESPONSE,
  OPCODE_REFRESH_SCORE,
  OPCODE_SERVER_MESSAGE,
  OPCODE_MOB_DEATH,
  OPCODE_SINGLE_ATTACK,
  OPCODE_AOE_ATTACK,
  OPCODE_SKILL_ATTACK,
  OPCODE_WHISPER_MESSAGE,
  OPCODE_GAME_MESSAGE_UNKNOWN,
  OPCODE_CHAT_BROADCAST,
  OPCODE_CHALLENGE,
  OPCODE_SERVER_SYNC,
  OPCODE_NPC_MENU_DATA,
  OPCODE_NPC_TELEPORT_COMMAND,
  OPCODE_ITEM_MOVE,
  OPCODE_BANK_GOLD_BALANCE,
  OPCODE_PARTY_INVITE,
  OPCODE_PARTY_ROSTER_MEMBER,
  OPCODE_PARTY_ROSTER_FINALIZE,
  OPCODE_PARTY_LEAVE,
  OPCODE_SHOP_INVENTORY,
  OPCODE_BANK_GOLD_DEPOSIT,
  OPCODE_BANK_GOLD_WITHDRAW,
  OPCODE_TRADE_ITEM_ADD,
  OPCODE_SELL_RESULT,
  OPCODE_TRADE_RESULT,
  OPCODE_HAND_GOLD_UPDATE,
} from '@shared/constants/opcodes';
import type { AppError } from '@shared/ipc/ipc-api';
import { protocolLogger } from '../logging';
import { TcpClient } from './tcp-transport';
import { PacketSecurity } from './packet-security';
import { PacketReader } from './packet-codec';
import {
  parseLoginSuccessfulPacket,
  parseResendCharListPacket,
  parseCharToWorldPacket,
  parseChatMessagePacket,
  parseWhisperMessagePacket,
  parseMovePacket,
  parseCreateMobPacket,
  parseRefreshScorePacket,
  parseCompactHpMpSyncPacket,
  parseDamageEventPacket,
  parseDespawnByObjectIdPacket,
  parseServerMessagePacket,
  parseMobDeathPacket,
  parseSingleAttackInboundPacket,
  parseMobDeathStatePacket,
  parseMobStateDeltaPacket,
  parseMobResyncPacket,
  parseGameMessageUnknownPacket,
  parseNpcMenuDataPacket,
  parseNpcTeleportCommandPacket,
  parseSlotDeltaUpdatePacket,
  parseItemMoveEchoPacket,
  parseBankGoldBalancePacket,
  parsePartyInviteNotifyPacket,
  parsePartyRosterMemberPacket,
  parsePartyRosterFinalizePacket,
  parsePartyLeavePacket,
  parseShopInventoryPacket,
  parseTradeItemAddPacket,
  parseBankGoldDeltaPacket,
  parseSellResultPacket,
  parseTradeResultPacket,
  parseHandGoldUpdatePacket,
} from './packet-parsers';
import { buildTeleportConfirmPacket } from './packet-builders';
import type {
  ParsedLoginSuccessful,
  ParsedResendCharList,
  ParsedCharToWorld,
  ParsedChatMessage,
  ParsedWhisperMessage,
  ParsedMove,
  ParsedCreateMob,
  ParsedRefreshScore,
  ParsedCompactHpMpSync,
  ParsedDamageEvent,
  ParsedServerMessage,
  ParsedMobDeath,
  ParsedSingleAttackInbound,
  ParsedMobDeathState,
  ParsedMobStateDelta,
  ParsedMobResync,
  ParsedDespawnByObjectId,
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
  ParsedTradeItemAdd,
  ParsedBankGoldDelta,
  ParsedSellResult,
  ParsedTradeResult,
  ParsedHandGoldUpdate,
} from './packet-types';
import { computeChallengeValue } from './challenge';

export interface ClientConnectionEvents {
  connected: [];
  disconnected: [];
  error: [error: Error];
  appError: [error: AppError];
  loginSuccessful: [data: ParsedLoginSuccessful];
  tokenResponse: [success: boolean];
  resendCharList: [data: ParsedResendCharList];
  charToWorld: [data: ParsedCharToWorld];
  gameMessage: [message: string];
  createMob: [data: ParsedCreateMob];
  charLogoutSignal: [];
  bulkWipeSlots: [];
  mobDeathState: [data: ParsedMobDeathState];
  mobStateDelta: [data: ParsedMobStateDelta];
  mobResync: [data: ParsedMobResync];
  despawnByObjectId: [data: ParsedDespawnByObjectId];
  chatMessage: [data: ParsedChatMessage];
  chatBroadcast: [data: ParsedChatMessage];
  movePacket: [data: ParsedMove];
  refreshScore: [data: ParsedRefreshScore];
  compactHpMpSync: [data: ParsedCompactHpMpSync];
  damageEvent: [data: ParsedDamageEvent];
  serverMessage: [data: ParsedServerMessage];
  mobDeath: [data: ParsedMobDeath];
  singleAttackInbound: [data: ParsedSingleAttackInbound];
  whisperMessage: [data: ParsedWhisperMessage];
  gameMessageUnknown: [data: ParsedGameMessageUnknown];
  npcMenuData: [data: ParsedNpcMenuData];
  npcTeleportCommand: [data: ParsedNpcTeleportCommand];
  slotDeltaUpdate: [data: ParsedSlotDeltaUpdate];
  itemMoveEcho: [data: ParsedItemMoveEcho];
  bankGoldBalance: [data: ParsedBankGoldBalance];
  partyInviteNotify: [data: ParsedPartyInviteNotify];
  partyRosterMember: [data: ParsedPartyRosterMember];
  partyRosterFinalize: [data: ParsedPartyRosterFinalize];
  partyLeave: [data: ParsedPartyLeave];
  shopInventory: [data: ParsedShopInventory];
  tradeItemAdd: [data: ParsedTradeItemAdd];
  bankGoldDelta: [data: ParsedBankGoldDelta];
  sellResult: [data: ParsedSellResult];
  tradeResult: [data: ParsedTradeResult];
  handGoldUpdate: [data: ParsedHandGoldUpdate];
  unknownPacket: [opcode: number];
}

export class ClientConnection extends EventEmitter<ClientConnectionEvents> {
  private tcp: TcpClient;
  public readonly security: PacketSecurity;
  private evolutionTier = 0;

  constructor(host: string, port: number, logTag = '', preparedSocket: Socket | null = null) {
    super();
    this.security = new PacketSecurity();
    this.tcp = new TcpClient(host, port, this.security, logTag, preparedSocket);

    this.tcp.on('connected', () => this.emit('connected'));
    this.tcp.on('disconnected', () => this.emit('disconnected'));
    this.tcp.on('error', (err) => this.emit('error', err));
    this.tcp.on('protocolWarning', (message) => {
      this.emit('appError', {
        code: 'PROTOCOL_WARNING',
        message,
        severity: 'warning',
      });
    });
    this.tcp.on('packet', (opcode, buffer) => this.interpretPacket(opcode, buffer));
  }

  public get isConnected(): boolean {
    return this.tcp.isConnected;
  }

  public get lastSendTime(): number {
    return this.tcp.lastSendTime;
  }

  public connect(): void {
    this.tcp.connect();
  }

  public disconnect(): void {
    this.tcp.disconnect();
    this.security.reset();
  }

  public send(buffer: Buffer): void {
    this.tcp.send(buffer);
  }

  public setEvolutionTier(tier: number): void {
    this.evolutionTier = tier;
  }

  private interpretPacket(opcode: number, buffer: Buffer): void {
    const reader = new PacketReader(buffer);
    const header = reader.readHeader();
    this.security.setLastPacket(Date.now());
    this.security.setTimePacket(header.timeStamp);

    // Inbound-opcode trace; gated so the message isn't built when debug is off.
    if (protocolLogger.isLevelEnabled('debug')) {
      protocolLogger.debug(`[rx] 0x${opcode.toString(16).toUpperCase()} size=${buffer.length}`);
    }

    try {
      this.dispatchPacket(opcode, buffer);
    } catch (err) {
      protocolLogger.error(
        `Error handling opcode 0x${opcode.toString(16).toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.emit('appError', {
        code: 'PACKET_PARSE_FAILED',
        message: `Failed to parse packet opcode 0x${opcode.toString(16).toUpperCase()}`,
        severity: 'error',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private dispatchPacket(opcode: number, buffer: Buffer): void {
    switch (opcode) {
      case OPCODE_LOGIN_SUCCESSFUL: {
        protocolLogger.info(`[entity-life] 0x10A received (size=${buffer.length})`);
        const data = parseLoginSuccessfulPacket(buffer);
        try {
          this.security.setHashTable(data.hashKeyTable);
        } catch (err) {
          this.emit('appError', {
            code: 'INVALID_HASH_TABLE',
            message: 'Failed to set hash table from login response',
            severity: 'error',
            details: err instanceof Error ? err.message : String(err),
          });
        }
        this.emit('loginSuccessful', data);
        break;
      }

      case OPCODE_TOKEN:
      case OPCODE_TOKEN_INCORRECT:
        this.emit('tokenResponse', opcode === OPCODE_TOKEN);
        break;

      case OPCODE_RESEND_CHAR_LIST:
        this.emit('resendCharList', parseResendCharListPacket(buffer));
        break;

      case OPCODE_CHAR_TO_WORLD:
        protocolLogger.info('[entity-life] bulkWipe trigger: 0x114 CharToWorld');
        this.emit('bulkWipeSlots');
        this.emit('charToWorld', parseCharToWorldPacket(buffer));
        break;

      case OPCODE_CLIENT_MESSAGE_TEXT: {
        const msg = parseChatMessagePacket(buffer);
        this.emit('gameMessage', msg.message);
        break;
      }

      case OPCODE_CREATE_MOB:
      case OPCODE_CREATE_MOB_NAMED: {
        const mob = parseCreateMobPacket(buffer);
        const tag = opcode === OPCODE_CREATE_MOB_NAMED ? 'createMobNamed (0x363)' : 'createMob';
        protocolLogger.info(
          `[entity-life] ${tag} idx=${mob.index} "${mob.name}" pos=(${mob.position.x},${mob.position.y}) type=${mob.type} nibble=0x${(mob.mobClassNibble & 0xf).toString(16)} actionType=0x${mob.actionType.toString(16)} hp=${mob.score.currHp}/${mob.score.maxHp}`,
        );
        this.emit('createMob', mob);
        break;
      }

      case OPCODE_PARTY_INVITE:
        this.emit('partyInviteNotify', parsePartyInviteNotifyPacket(buffer));
        break;

      case OPCODE_PARTY_ROSTER_MEMBER:
        this.emit('partyRosterMember', parsePartyRosterMemberPacket(buffer));
        break;

      case OPCODE_PARTY_ROSTER_FINALIZE:
        this.emit('partyRosterFinalize', parsePartyRosterFinalizePacket(buffer));
        break;

      case OPCODE_PARTY_LEAVE:
        this.emit('partyLeave', parsePartyLeavePacket(buffer));
        break;

      case OPCODE_CHAR_LOGOUT_SIGNAL:
        protocolLogger.info('[entity-life] bulkWipe trigger: 0x116 CharLogoutSignal');
        this.emit('bulkWipeSlots');
        this.emit('charLogoutSignal');
        break;

      case OPCODE_MOB_DEATH_STATE:
        this.emit('mobDeathState', parseMobDeathStatePacket(buffer));
        break;

      case OPCODE_MOB_STATE_DELTA: {
        // game: per-entity ~1 Hz presence/state pulse.
        // sub==2 ⇒ `+0x221 = 0` (REVIVE). sub==1/3 are anim/FX only on wire, but
        // still prove the slot is live — always forward so the renderer can
        // re-stamp `lastSeenMs` (teleport freshness). Revive handling stays
        // gated on sub==2 in the world bridge.
        const delta = parseMobStateDeltaPacket(buffer);
        if (delta.subType === 2) {
          protocolLogger.info(`[entity-life] 0x36A sub==2 revive idx=${delta.entityId}`);
        }
        this.emit('mobStateDelta', delta);
        break;
      }

      case OPCODE_MOB_RESYNC: {
        const resync = parseMobResyncPacket(buffer);
        protocolLogger.info(`[entity-life] 0x36B resync idx=${resync.entityId}`);
        this.emit('mobResync', resync);
        break;
      }

      case OPCODE_CHAT_MESSAGE:
        this.emit('chatMessage', parseChatMessagePacket(buffer));
        break;

      case OPCODE_CHAT_BROADCAST:
        this.emit('chatBroadcast', parseChatMessagePacket(buffer));
        break;

      case OPCODE_MOVE:
      case OPCODE_MOVE_RESPONSE:
        this.emit('movePacket', parseMovePacket(buffer));
        break;

      case OPCODE_REFRESH_SCORE:
        this.emit('refreshScore', parseRefreshScorePacket(buffer));
        break;

      case OPCODE_COMPACT_HP_MP_SYNC:
        this.emit('compactHpMpSync', parseCompactHpMpSyncPacket(buffer));
        break;

      case OPCODE_DAMAGE_EVENT:
        this.emit('damageEvent', parseDamageEventPacket(buffer));
        break;

      case OPCODE_DESPAWN_BY_OBJECT_ID: {
        const despawn = parseDespawnByObjectIdPacket(buffer);
        protocolLogger.info(`[entity-life] despawn 0x16f objectId=${despawn.objectId}`);
        this.emit('despawnByObjectId', despawn);
        break;
      }

      case OPCODE_SLOT_DELTA_UPDATE:
        this.emit('slotDeltaUpdate', parseSlotDeltaUpdatePacket(buffer));
        break;

      case OPCODE_ITEM_MOVE:
        this.emit('itemMoveEcho', parseItemMoveEchoPacket(buffer));
        break;

      case OPCODE_BANK_GOLD_BALANCE:
        this.emit('bankGoldBalance', parseBankGoldBalancePacket(buffer));
        break;

      case OPCODE_BANK_GOLD_DEPOSIT:
      case OPCODE_BANK_GOLD_WITHDRAW:
        this.emit('bankGoldDelta', parseBankGoldDeltaPacket(buffer, opcode));
        break;

      case OPCODE_TRADE_ITEM_ADD:
        this.emit('tradeItemAdd', parseTradeItemAddPacket(buffer));
        break;

      case OPCODE_SELL_RESULT:
        this.emit('sellResult', parseSellResultPacket(buffer));
        break;

      case OPCODE_TRADE_RESULT:
        this.emit('tradeResult', parseTradeResultPacket(buffer));
        break;

      case OPCODE_HAND_GOLD_UPDATE:
        this.emit('handGoldUpdate', parseHandGoldUpdatePacket(buffer));
        break;

      case OPCODE_SERVER_MESSAGE:
        this.emit('serverMessage', parseServerMessagePacket(buffer));
        break;

      case OPCODE_MOB_DEATH: {
        const death = parseMobDeathPacket(buffer);
        protocolLogger.info(
          `[entity-life] mobDeath killed=${death.killed} killer=${death.killer} exp=${death.exp}`,
        );
        this.emit('mobDeath', death);
        break;
      }

      case OPCODE_SINGLE_ATTACK:
      case OPCODE_AOE_ATTACK:
      case OPCODE_SKILL_ATTACK: {
        const maxTargets =
          opcode === OPCODE_SINGLE_ATTACK ? 1 : opcode === OPCODE_AOE_ATTACK ? 2 : 13;
        const atk = parseSingleAttackInboundPacket(buffer, maxTargets);
        protocolLogger.info(
          `[entity-life] attack 0x${opcode.toString(16)} attacker=${atk.attackerIndex} targets=${atk.targets.map((t) => t.targetIndex).join(',')} skill=${atk.skillCode}`,
        );
        this.emit('singleAttackInbound', atk);
        break;
      }

      case OPCODE_WHISPER_MESSAGE:
        this.emit('whisperMessage', parseWhisperMessagePacket(buffer));
        break;

      case OPCODE_GAME_MESSAGE_UNKNOWN: {
        const gmData = parseGameMessageUnknownPacket(buffer);
        this.emit('gameMessageUnknown', gmData);
        break;
      }

      case OPCODE_CHALLENGE: {
        const value = computeChallengeValue(buffer, this.evolutionTier);
        this.security.setChallengeValue(value);
        break;
      }

      case OPCODE_NPC_MENU_DATA: {
        protocolLogger.info(
          `[NPC] 0x1C6 received: size=${buffer.length} hex=${buffer.toString('hex')}`,
        );
        const npcMenu = parseNpcMenuDataPacket(buffer);
        protocolLogger.info(
          `[NPC] Q&A: question="${npcMenu.question}" answers=[${npcMenu.answers.map((a, i) => `${i}:"${a}"`).join(', ')}]`,
        );
        this.emit('npcMenuData', npcMenu);
        break;
      }

      case OPCODE_NPC_TELEPORT_COMMAND: {
        protocolLogger.info(
          `[NPC] 0x1C1 received: size=${buffer.length} hex=${buffer.toString('hex')}`,
        );
        const teleport = parseNpcTeleportCommandPacket(buffer);
        protocolLogger.info(
          `[NPC] Teleport: cat=${teleport.categoryIndex} dest=${teleport.destinationIndex} extra=${teleport.extra}`,
        );
        const relay = buildTeleportConfirmPacket(
          this.security,
          teleport.header.clientId,
          teleport.categoryIndex,
          teleport.destinationIndex,
          teleport.extra,
        );
        this.send(relay);
        protocolLogger.info('[NPC] Auto-relayed 0x2C2 confirm');
        this.emit('npcTeleportCommand', teleport);
        break;
      }

      case OPCODE_SERVER_SYNC:
        break;

      case OPCODE_SERVER_MULTI_SIGNAL: {
        // forced scene reset (kick-to-menu) — modes 10..19 → char-select,
        // `==0x16 && level<1000` → local death, else → server-select. Entities clear only
        // as a scene-teardown side effect, so emitting a wipe would fabricate behavior.
        const mode = buffer.length >= 0x12 ? buffer.readInt16LE(0x10) : -1;
        protocolLogger.warn(
          `[entity-life] 0x292 seen: size=${buffer.length} mode=${mode} hex=${buffer.toString('hex')}`,
        );
        break;
      }

      case OPCODE_SHOP_INVENTORY: {
        const shop = parseShopInventoryPacket(buffer);
        protocolLogger.info(
          `[shop] 0x17C subType=${shop.subType} items=${shop.items.length} size=${buffer.length}`,
        );
        this.emit('shopInventory', shop);
        break;
      }

      default: {
        const isNpcRange =
          (opcode >= 0x1c0 && opcode <= 0x1cf) || (opcode >= 0x370 && opcode <= 0x3af);
        protocolLogger[isNpcRange ? 'info' : 'debug'](
          `${isNpcRange ? '[NPC?] ' : ''}Unknown opcode: 0x${opcode.toString(16).toUpperCase()} (${opcode}), size=${buffer.length} hex=${buffer.toString('hex')}`,
        );
        this.emit('unknownPacket', opcode);
        break;
      }
    }
  }
}
