import type { IPC } from './ipc-channels';
import type {
  AppError,
  IpcLoginSuccess,
  IpcServerMessage,
  IpcCharToWorld,
  IpcMobDeathState,
  IpcMobDeath,
  IpcMobStateDelta,
  IpcMobResync,
  IpcDespawnByObjectId,
  IpcRefreshScore,
  IpcMobHpSync,
  IpcPlayerHpMpSync,
  IpcSlotDeltaUpdate,
  IpcMoveAnnounced,
  IpcMoveEnqueued,
  IpcMoveRejected,
  IpcPlayerPosition,
  IpcRubberband,
  IpcTeleport,
  IpcMobMove,
  IpcChatMessage,
  IpcChatBroadcast,
  IpcWhisperMessage,
  IpcNpcMenuData,
  IpcLogEntry,
  IpcBootProgress,
  IpcTeleportScrollDone,
  IpcPartyInviteReceived,
  IpcPartyRosterMember,
  IpcPartyLeft,
  IpcShopInventory,
  IpcHandGoldDelta,
  IpcItemMoveEcho,
  IpcItemDestroyFailed,
  IpcSingleAttackInbound,
  IpcTradeItemAdd,
  IpcSellResult,
  IpcTradeResult,
  IpcHandGoldSet,
  ProxyConnectionStatus,
} from './ipc-api';
import type { ViewSelChar, Entity } from '../types/game-types';

/**
 * Maps each outbound IPC channel (Main → Renderer) to its payload type.
 *
 * Channels with `undefined` payload are sent with no arguments (e.g. error signals).
 * Used by IpcSendFn to enforce correct payload shape at compile-time.
 */
export type IpcOutboundMap = {
  [IPC.CONNECTION_STATUS]: 'connected' | 'disconnected' | 'error';
  [IPC.PROXY_CONNECTION_STATUS]: ProxyConnectionStatus;
  [IPC.APP_ERROR]: AppError;
  [IPC.LOGIN_SUCCESS]: IpcLoginSuccess;
  [IPC.SERVER_MESSAGE]: IpcServerMessage;
  [IPC.TOKEN_RESPONSE]: boolean;
  [IPC.CHAR_LIST]: ViewSelChar;
  [IPC.CHAR_TO_WORLD]: IpcCharToWorld;
  [IPC.CHAR_LOGOUT_SIGNAL]: undefined;
  [IPC.CREATE_MOB]: Entity;
  [IPC.MOB_DEATH_STATE]: IpcMobDeathState;
  [IPC.MOB_DEATH]: IpcMobDeath;
  [IPC.MOB_STATE_DELTA]: IpcMobStateDelta;
  [IPC.MOB_RESYNC]: IpcMobResync;
  [IPC.DESPAWN_BY_OBJECT_ID]: IpcDespawnByObjectId;
  [IPC.ENTITIES_RESET]: undefined;
  [IPC.REFRESH_SCORE]: IpcRefreshScore;
  [IPC.MOB_HP_SYNC]: IpcMobHpSync;
  [IPC.PLAYER_HP_MP_SYNC]: IpcPlayerHpMpSync;
  [IPC.SLOT_DELTA_UPDATE]: IpcSlotDeltaUpdate;
  [IPC.MOVE_ENQUEUED]: IpcMoveEnqueued;
  [IPC.MOVE_ANNOUNCED]: IpcMoveAnnounced;
  [IPC.MOVE_REJECTED]: IpcMoveRejected;
  [IPC.PLAYER_POSITION]: IpcPlayerPosition;
  [IPC.RUBBERBAND]: IpcRubberband;
  [IPC.TELEPORT]: IpcTeleport;
  [IPC.MOB_MOVE_RECEIVED]: IpcMobMove;
  [IPC.CHAT_MESSAGE]: IpcChatMessage;
  [IPC.CHAT_BROADCAST]: IpcChatBroadcast;
  [IPC.WHISPER_MESSAGE]: IpcWhisperMessage;
  [IPC.GAME_MESSAGE]: string;
  [IPC.GAME_MESSAGE_UNKNOWN]: { type: number; code: number };
  [IPC.NPC_MENU_DATA]: IpcNpcMenuData;
  [IPC.TELEPORT_SCROLL_DONE]: IpcTeleportScrollDone;
  [IPC.SHOP_INVENTORY]: IpcShopInventory;
  [IPC.BANK_GOLD_BALANCE]: { balance: number };
  [IPC.HAND_GOLD_DELTA]: IpcHandGoldDelta;
  [IPC.HAND_GOLD_SET]: IpcHandGoldSet;
  [IPC.ITEM_MOVE_ECHO]: IpcItemMoveEcho;
  [IPC.ITEM_DESTROY_FAILED]: IpcItemDestroyFailed;
  [IPC.SINGLE_ATTACK_INBOUND]: IpcSingleAttackInbound;
  [IPC.TRADE_ITEM_ADD]: IpcTradeItemAdd;
  [IPC.SELL_RESULT]: IpcSellResult;
  [IPC.TRADE_RESULT]: IpcTradeResult;
  [IPC.LOG_BATCH]: IpcLogEntry[];
  [IPC.BOOT_PROGRESS]: IpcBootProgress;
  [IPC.PARTY_INVITE_RECEIVED]: IpcPartyInviteReceived;
  [IPC.PARTY_ROSTER_UPDATE]: IpcPartyRosterMember;
  [IPC.PARTY_LEFT]: IpcPartyLeft;
};
