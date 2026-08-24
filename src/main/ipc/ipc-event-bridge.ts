/**
 * BRIDGE: Server → Renderer (EventEmitter → Electron IPC)
 *
 * Listens to ClientConnection events (Node.js EventEmitter, in-process)
 * and forwards them to the renderer via webContents.send (Electron IPC, cross-process).
 *
 *   connection.on('chatMessage', ...)   ← EventEmitter (in-process, typed)
 *   send(IPC.CHAT_MESSAGE, ...)         ← Electron IPC  (cross-process, serialized)
 */
import { IPC } from '@shared/ipc/ipc-channels';
import { SERVER_MOVE_SRC_TOLERANCE } from '@shared/constants/movement';
import { chebyshev } from '@shared/lib/movement-math';
import type { AppError } from '@shared/ipc/ipc-api';
import type {
  ClientConnection,
  ClientControl,
  ParsedLoginSuccessful,
  ParsedCharToWorld,
} from '@main/protocol';
import type { SessionManager } from '@main/session';
import { ipcLogger } from '../logging';
import type { IpcSendFn, SafeHandlerFn } from './ipc-types';
import {
  commandToCodes,
  transformSelCharForIpc,
  transformCharToWorldForIpc,
  transformCreateMobForIpc,
  transformMoveForMobIpc,
  transformRefreshScoreForIpc,
  transformRefreshScoreToMobHpSync,
  transformCompactHpMpSyncToMobHpSync,
  transformCompactHpMpSyncToPlayerHpMp,
  transformDamageEventToPlayerHpMp,
  transformMobDeathForIpc,
  transformMobDeathStateForIpc,
  transformMobStateDeltaForIpc,
  transformMobResyncForIpc,
  transformDespawnByObjectIdForIpc,
  transformSingleAttackInboundForIpc,
  transformChatMessageForIpc,
  transformNpcMenuDataForIpc,
  transformSlotDeltaUpdateForIpc,
} from './ipc-transformers';

export const bindConnectionEvents = (
  connection: ClientConnection,
  control: ClientControl,
  session: SessionManager,
  send: IpcSendFn,
  safeHandler: SafeHandlerFn,
): void => {
  connection.on(
    'connected',
    safeHandler(() => {
      send(IPC.CONNECTION_STATUS, 'connected');
    }),
  );

  connection.on(
    'disconnected',
    safeHandler(() => {
      send(IPC.CONNECTION_STATUS, 'disconnected');
      session.cleanup();
    }),
  );

  connection.on(
    'error',
    safeHandler((err: Error) => {
      ipcLogger.error(`Connection error: ${err.message}`);
      send(IPC.CONNECTION_STATUS, 'error');
    }),
  );

  connection.on(
    'appError',
    safeHandler((error: AppError) => {
      send(IPC.APP_ERROR, error);
    }),
  );

  connection.on(
    'loginSuccessful',
    safeHandler((data: ParsedLoginSuccessful) => {
      control.setClientId(data.header.clientId);
      const selChar = transformSelCharForIpc(data.selChar);
      send(IPC.LOGIN_SUCCESS, {
        selChar,
        accName: data.accName,
        cargo: data.cargo,
        cargoCoin: data.cargoCoin,
      });
    }),
  );

  connection.on(
    'serverMessage',
    safeHandler((data) => {
      send(IPC.SERVER_MESSAGE, { subtype: data.subtype, code: data.code });
    }),
  );

  connection.on(
    'tokenResponse',
    safeHandler((success) => {
      send(IPC.TOKEN_RESPONSE, success);
    }),
  );

  connection.on(
    'resendCharList',
    safeHandler((data) => {
      const selChar = transformSelCharForIpc(data.selChar);
      send(IPC.CHAR_LIST, selChar);
    }),
  );

  connection.on(
    'charToWorld',
    safeHandler((parsed: ParsedCharToWorld) => {
      // Session-state side-effects (clientId, mobIndex, evolutionTier, action queue)
      // are handled by SessionManager — bridge only translates and forwards.
      session.onCharEnteredWorld(parsed, connection, control);
      send(IPC.CHAR_TO_WORLD, transformCharToWorldForIpc(parsed));
    }),
  );

  connection.on(
    'charLogoutSignal',
    safeHandler(() => {
      send(IPC.CHAR_LOGOUT_SIGNAL);
    }),
  );

  connection.on(
    'bulkWipeSlots',
    safeHandler(() => {
      send(IPC.ENTITIES_RESET);
    }),
  );

  connection.on(
    'gameMessage',
    safeHandler((message) => {
      send(IPC.GAME_MESSAGE, message);
    }),
  );

  connection.on(
    'chatMessage',
    safeHandler((data) => {
      send(IPC.CHAT_MESSAGE, transformChatMessageForIpc(data));
    }),
  );

  connection.on(
    'chatBroadcast',
    safeHandler((data) => {
      send(IPC.CHAT_BROADCAST, { message: data.message });
    }),
  );

  connection.on(
    'whisperMessage',
    safeHandler((data) => {
      send(IPC.WHISPER_MESSAGE, { command: data.command, message: data.message });
    }),
  );

  connection.on(
    'createMob',
    safeHandler((data) => {
      const entity = transformCreateMobForIpc(data, session.playerMobIndex ?? null);
      if (entity === null) {
        // Wire-legal but unexpected. CharToWorld owns
        // local-player state; a stray self-targeted CreateMob would corrupt
        // the player slice if forwarded.
        ipcLogger.warn(`CreateMob targets player_self (index=${data.index}) — dropped`);
        return;
      }
      send(IPC.CREATE_MOB, entity);
    }),
  );

  // --- Party (grupo): relay invite notifications + roster members to the renderer ---
  connection.on(
    'partyInviteNotify',
    safeHandler((data) => {
      send(IPC.PARTY_INVITE_RECEIVED, {
        inviterIndex: data.inviterIndex,
        inviterName: data.inviterName,
      });
    }),
  );

  connection.on(
    'partyRosterMember',
    safeHandler((data) => {
      send(IPC.PARTY_ROSTER_UPDATE, {
        charIndex: data.charIndex,
        name: data.name,
        isLeader: data.isLeader,
      });
    }),
  );

  connection.on(
    'partyLeave',
    safeHandler((data) => {
      send(IPC.PARTY_LEFT, { charIndex: data.charIndex });
    }),
  );

  connection.on(
    'mobDeathState',
    safeHandler((data) => {
      send(IPC.MOB_DEATH_STATE, transformMobDeathStateForIpc(data));
    }),
  );

  connection.on(
    'mobStateDelta',
    safeHandler((data) => {
      send(IPC.MOB_STATE_DELTA, transformMobStateDeltaForIpc(data));
    }),
  );

  connection.on(
    'mobResync',
    safeHandler((data) => {
      send(IPC.MOB_RESYNC, transformMobResyncForIpc(data));
    }),
  );

  connection.on(
    'despawnByObjectId',
    safeHandler((data) => {
      send(IPC.DESPAWN_BY_OBJECT_ID, transformDespawnByObjectIdForIpc(data));
    }),
  );

  connection.on(
    'movePacket',
    safeHandler((data) => {
      const isSelfEcho = data.header.clientId === session.playerMobIndex;

      // Rubberband: anti-cheat correction. Macro plan is invalidated.
      if (isSelfEcho && (data.moveType === 2 || data.moveType === 0)) {
        const ms = session.getMovementState();
        const steering =
          ms != null &&
          chebyshev(data.lastPosition, ms.getPredictedPosition(Date.now())) <=
            SERVER_MOVE_SRC_TOLERANCE;
        if (steering && ms) {
          const codes = commandToCodes(data.command);
          ipcLogger.info(
            `[STEERING] Server corrected move to (${data.destiny.x},${data.destiny.y}) mt=${data.moveType} steps=${codes.length} — walking, no snap`,
          );
          ms.applyServerSteering(data.lastPosition, data.destiny, codes, data.speedMove);
          send(IPC.RUBBERBAND, { pos: data.destiny, epoch: ms.epoch, steering: true });
          return;
        }
        ipcLogger.warn(
          `[RUBBERBAND] Server forced reposition to (${data.destiny.x},${data.destiny.y}) mt=${data.moveType}`,
        );
        ms?.applyRubberband(data.destiny);
        send(IPC.RUBBERBAND, { pos: data.destiny, epoch: ms?.epoch ?? 0, steering: false });
        return;
      }

      // Teleport: server-forced area change (NPC teleport, portal, skill).
      if (isSelfEcho && data.moveType !== 0) {
        ipcLogger.info(
          `[TELEPORT] moveType=${data.moveType} → (${data.destiny.x},${data.destiny.y})`,
        );
        const ms = session.getMovementState();
        ms?.applyRubberband(data.destiny);
        send(IPC.TELEPORT, {
          pos: data.destiny,
          moveType: data.moveType,
          epoch: ms?.epoch ?? 0,
        });
        return;
      }

      // Self-echoes already returned above; any move here is another entity's.
      send(IPC.MOB_MOVE_RECEIVED, transformMoveForMobIpc(data));
    }),
  );

  connection.on(
    'refreshScore',
    safeHandler((data) => {
      if (data.header.clientId === session.playerMobIndex) {
        send(IPC.REFRESH_SCORE, transformRefreshScoreForIpc(data));
      } else {
        // Remote: presence beacon — re-stamp freshness + absolute HP/MP + revive.
        send(IPC.MOB_HP_SYNC, transformRefreshScoreToMobHpSync(data));
      }
    }),
  );

  connection.on(
    'compactHpMpSync',
    safeHandler((data) => {
      if (data.header.clientId === session.playerMobIndex) {
        send(IPC.PLAYER_HP_MP_SYNC, transformCompactHpMpSyncToPlayerHpMp(data));
      } else {
        send(IPC.MOB_HP_SYNC, transformCompactHpMpSyncToMobHpSync(data));
      }
    }),
  );

  connection.on(
    'damageEvent',
    safeHandler((data) => {
      // Local only — a remote absolute HP write would race the 0x39D delta heuristic.
      if (data.header.clientId !== session.playerMobIndex) return;
      send(IPC.PLAYER_HP_MP_SYNC, transformDamageEventToPlayerHpMp(data));
    }),
  );

  connection.on(
    'slotDeltaUpdate',
    safeHandler((data) => {
      // Mount HP / equipment / inventory deltas — only the local player matters
      // here (other entities' equipment is delivered via CreateMob, not 0x182).
      if (data.header.clientId !== session.playerMobIndex) return;
      send(IPC.SLOT_DELTA_UPDATE, transformSlotDeltaUpdateForIpc(data));
    }),
  );

  // Bank echoes only arrive in response to our own bank ops; not gated on
  // playerMobIndex (the 0x339 balance is addressed from the bank NPC sentinel).
  connection.on(
    'itemMoveEcho',
    safeHandler((data) => {
      send(IPC.ITEM_MOVE_ECHO, {
        dstKind: data.dstKind,
        dstSlot: data.dstSlot,
        srcKind: data.srcKind,
        srcSlot: data.srcSlot,
      });
    }),
  );

  connection.on(
    'bankGoldBalance',
    safeHandler((data) => {
      send(IPC.BANK_GOLD_BALANCE, { balance: data.balance });
    }),
  );

  connection.on(
    'bankGoldDelta',
    safeHandler((data) => {
      const sign = data.opcode === 0x388 ? -1 : 1;
      send(IPC.HAND_GOLD_DELTA, { delta: sign * data.amount });
    }),
  );

  connection.on(
    'tradeItemAdd',
    safeHandler((data) => {
      send(IPC.TRADE_ITEM_ADD, { slot: data.slot, item: data.item });
    }),
  );

  connection.on(
    'sellResult',
    safeHandler((data) => {
      send(IPC.SELL_RESULT, { slot: data.slot });
    }),
  );

  connection.on(
    'tradeResult',
    safeHandler((data) => {
      send(IPC.TRADE_RESULT, { gold: data.gold });
    }),
  );

  connection.on(
    'handGoldUpdate',
    safeHandler((data) => {
      send(IPC.HAND_GOLD_SET, { gold: data.gold });
    }),
  );

  connection.on(
    'shopInventory',
    safeHandler((data) => {
      send(IPC.SHOP_INVENTORY, {
        subType: data.subType,
        items: data.items.map((it) => ({
          itemId: it.itemId,
          price: it.price,
          slotIndex: it.slotIndex,
        })),
      });
    }),
  );

  connection.on(
    'mobDeath',
    safeHandler((data) => {
      send(IPC.MOB_DEATH, transformMobDeathForIpc(data));
    }),
  );

  connection.on(
    'singleAttackInbound',
    safeHandler((data) => {
      // No filter — broadcasts every nearby hit. Renderer applies HP delta
      // heuristic (see world-bridge.ts onSingleAttackInbound).
      send(IPC.SINGLE_ATTACK_INBOUND, transformSingleAttackInboundForIpc(data));
    }),
  );

  connection.on(
    'gameMessageUnknown',
    safeHandler((data) => {
      send(IPC.GAME_MESSAGE_UNKNOWN, { type: data.type, code: data.code });
    }),
  );

  connection.on(
    'npcMenuData',
    safeHandler((data) => {
      ipcLogger.info(`[NPC] Q&A dialog forwarded to renderer: "${data.question}"`);
      send(IPC.NPC_MENU_DATA, transformNpcMenuDataForIpc(data));
    }),
  );

  connection.on(
    'npcTeleportCommand',
    safeHandler((data) => {
      ipcLogger.info(
        `[NPC] Teleport command: cat=${data.categoryIndex} dest=${data.destinationIndex} (relay done in protocol layer)`,
      );
    }),
  );
};
