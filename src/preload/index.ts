import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import type { WydBotAPI } from '@shared/ipc/ipc-api';
import './devtools-traps';
import './agent-traps';

/**
 * Helper to create a one-way IPC listener that returns an unsubscribe function.
 */
const onIpc = <T>(channel: string, callback: (data: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, data: T): void => {
    callback(data);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};

const wydAPI: WydBotAPI = {
  // --- Connection ---
  connect: (payload) => ipcRenderer.send(IPC.CONNECT, payload),
  disconnect: () => ipcRenderer.send(IPC.DISCONNECT),
  onConnectionStatus: (cb) => onIpc(IPC.CONNECTION_STATUS, cb),
  onProxyConnectionStatus: (cb) => onIpc(IPC.PROXY_CONNECTION_STATUS, cb),

  // --- Authentication ---
  login: (payload) => ipcRenderer.send(IPC.LOGIN, payload),
  onLoginSuccess: (cb) => onIpc(IPC.LOGIN_SUCCESS, cb),
  onServerMessage: (cb) => onIpc(IPC.SERVER_MESSAGE, cb),

  // --- Token ---
  submitToken: (payload) => ipcRenderer.send(IPC.TOKEN_SUBMIT, payload),
  onTokenResponse: (cb) => onIpc(IPC.TOKEN_RESPONSE, cb),

  // --- Character Selection ---
  onCharList: (cb) => onIpc(IPC.CHAR_LIST, cb),
  selectChar: (payload) => ipcRenderer.send(IPC.CHAR_SELECT, payload),

  // --- World ---
  onCharToWorld: (cb) => onIpc(IPC.CHAR_TO_WORLD, cb),
  charLogout: () => ipcRenderer.send(IPC.CHAR_LOGOUT),
  onCharLogoutSignal: (cb) => onIpc(IPC.CHAR_LOGOUT_SIGNAL, cb),

  // --- Mobs ---
  onCreateMob: (cb) => onIpc(IPC.CREATE_MOB, cb),
  onMobDeathState: (cb) => onIpc(IPC.MOB_DEATH_STATE, cb),
  onMobStateDelta: (cb) => onIpc(IPC.MOB_STATE_DELTA, cb),
  onMobResync: (cb) => onIpc(IPC.MOB_RESYNC, cb),
  onMobDeath: (cb) => onIpc(IPC.MOB_DEATH, cb),
  onDespawnByObjectId: (cb) => onIpc(IPC.DESPAWN_BY_OBJECT_ID, cb),
  onEntitiesReset: (cb) => onIpc(IPC.ENTITIES_RESET, cb),
  onSingleAttackInbound: (cb) => onIpc(IPC.SINGLE_ATTACK_INBOUND, cb),
  onRefreshScore: (cb) => onIpc(IPC.REFRESH_SCORE, cb),
  onMobHpSync: (cb) => onIpc(IPC.MOB_HP_SYNC, cb),
  onPlayerHpMpSync: (cb) => onIpc(IPC.PLAYER_HP_MP_SYNC, cb),
  onSlotDeltaUpdate: (cb) => onIpc(IPC.SLOT_DELTA_UPDATE, cb),
  onItemMoveEcho: (cb) => onIpc(IPC.ITEM_MOVE_ECHO, cb),
  onBankGoldBalance: (cb) => onIpc(IPC.BANK_GOLD_BALANCE, cb),
  onHandGoldDelta: (cb) => onIpc(IPC.HAND_GOLD_DELTA, cb),
  onHandGoldSet: (cb) => onIpc(IPC.HAND_GOLD_SET, cb),
  onTradeItemAdd: (cb) => onIpc(IPC.TRADE_ITEM_ADD, cb),
  onSellResult: (cb) => onIpc(IPC.SELL_RESULT, cb),
  onTradeResult: (cb) => onIpc(IPC.TRADE_RESULT, cb),

  // --- Movement ---
  move: (payload) => ipcRenderer.send(IPC.MOVE, payload),
  setMoveRoute: (payload) => ipcRenderer.send(IPC.MOVE_SET_ROUTE, payload),
  onMoveEnqueued: (cb) => onIpc(IPC.MOVE_ENQUEUED, cb),
  onMoveAnnounced: (cb) => onIpc(IPC.MOVE_ANNOUNCED, cb),
  onMoveRejected: (cb) => onIpc(IPC.MOVE_REJECTED, cb),
  onPlayerPosition: (cb) => onIpc(IPC.PLAYER_POSITION, cb),
  onMobMove: (cb) => onIpc(IPC.MOB_MOVE_RECEIVED, cb),

  // --- Combat ---
  attack: (payload) => ipcRenderer.send(IPC.ATTACK, payload),
  castBuff: (payload) => ipcRenderer.send(IPC.CAST_BUFF, payload),
  respawn: () => ipcRenderer.send(IPC.RESPAWN),
  npcClick: (payload) => ipcRenderer.send(IPC.NPC_CLICK, payload),
  dialogClick: (payload) => ipcRenderer.send(IPC.DIALOG_CLICK, payload),
  miniPopupClick: (payload) => ipcRenderer.send(IPC.MINIPOPUP_CLICK, payload),
  useZonePortal: () => ipcRenderer.send(IPC.USE_ZONE_PORTAL),
  itemMove: (payload) => ipcRenderer.send(IPC.ITEM_MOVE, payload),
  itemDestroy: (payload) => ipcRenderer.send(IPC.ITEM_DESTROY, payload),
  onItemDestroyFailed: (cb) => onIpc(IPC.ITEM_DESTROY_FAILED, cb),
  useItem: (payload) => ipcRenderer.send(IPC.USE_ITEM, payload),
  useTeleportScroll: (payload) => ipcRenderer.send(IPC.USE_TELEPORT_SCROLL, payload),
  useReturnScroll: (payload) => ipcRenderer.send(IPC.USE_RETURN_SCROLL, payload),
  onTeleportScrollDone: (cb) => onIpc(IPC.TELEPORT_SCROLL_DONE, cb),
  bankDepositGold: (payload) => ipcRenderer.send(IPC.BANK_GOLD_DEPOSIT, payload),
  bankWithdrawGold: (payload) => ipcRenderer.send(IPC.BANK_GOLD_WITHDRAW, payload),
  composeSubmit: (payload) => ipcRenderer.send(IPC.COMPOSE_SUBMIT, payload),
  shopBuy: (payload) => ipcRenderer.send(IPC.SHOP_BUY, payload),
  onShopInventory: (cb) => onIpc(IPC.SHOP_INVENTORY, cb),

  // --- Party (grupo) ---
  partyInvite: (payload) => ipcRenderer.send(IPC.PARTY_INVITE, payload),
  partyAccept: (payload) => ipcRenderer.send(IPC.PARTY_ACCEPT, payload),
  partyLeave: () => ipcRenderer.send(IPC.PARTY_LEAVE),
  onPartyInviteReceived: (cb) => onIpc(IPC.PARTY_INVITE_RECEIVED, cb),
  onPartyRosterUpdate: (cb) => onIpc(IPC.PARTY_ROSTER_UPDATE, cb),
  onPartyLeft: (cb) => onIpc(IPC.PARTY_LEFT, cb),

  // --- Server correction (MoveType=2 rubberband) ---
  onRubberband: (cb) => onIpc(IPC.RUBBERBAND, cb),

  // --- Server-forced teleport (MoveType ∈ {1,3,4,6,7}) ---
  onTeleport: (cb) => onIpc(IPC.TELEPORT, cb),

  // --- Chat ---
  sendMessage: (payload) => ipcRenderer.send(IPC.SEND_MESSAGE, payload),
  sendWhisper: (payload) => ipcRenderer.send(IPC.WHISPER_MESSAGE, payload),
  onChatMessage: (cb) => onIpc(IPC.CHAT_MESSAGE, cb),
  onChatBroadcast: (cb) => onIpc(IPC.CHAT_BROADCAST, cb),
  onWhisperMessage: (cb) => onIpc(IPC.WHISPER_MESSAGE, cb),
  onGameMessage: (cb) => onIpc(IPC.GAME_MESSAGE, cb),

  // --- NPC ---
  onNpcMenuData: (cb) => onIpc(IPC.NPC_MENU_DATA, cb),

  // --- Errors ---
  onAppError: (cb) => onIpc(IPC.APP_ERROR, cb),

  // --- Logs ---
  onLogBatch: (cb) => onIpc(IPC.LOG_BATCH, cb),
  sendRendererLog: (entry) => ipcRenderer.send(IPC.RENDERER_LOG, entry),

  // --- Serverlist ---
  loadServerlist: () => ipcRenderer.invoke(IPC.SERVERLIST_LOAD),

  // --- Strdef (server message strings) ---
  loadStrdef: () => ipcRenderer.invoke(IPC.STRDEF_LOAD),

  getMachineBindingKey: () => ipcRenderer.invoke(IPC.MACHINE_BINDING_KEY),
  previewHardwareIdentity: (identitySeed) =>
    ipcRenderer.invoke(IPC.HARDWARE_IDENTITY_PREVIEW, identitySeed),

  // --- Walkability (world heightmap, one-shot at boot) ---
  getWalkabilityHeightmap: () => ipcRenderer.invoke(IPC.WALKABILITY_GET_HEIGHTMAP),

  // --- Game Data ---
  getItemDb: () => ipcRenderer.invoke(IPC.DATA_GET_ITEM_DB),
  getComposeCatalog: () => ipcRenderer.invoke(IPC.DATA_GET_COMPOSE_CATALOG),

  // --- App Config (load/save) ---
  openAppConfig: (payload) => ipcRenderer.invoke(IPC.APP_CONFIG_OPEN, payload),
  saveAppConfig: (payload) => ipcRenderer.invoke(IPC.APP_CONFIG_SAVE, payload),

  // --- Docs ---
  openDocs: () => ipcRenderer.invoke(IPC.DOCS_OPEN),

  // --- Boot / App version ---
  onBootProgress: (cb) => onIpc(IPC.BOOT_PROGRESS, cb),
  getBootProgressSnapshot: () => ipcRenderer.invoke(IPC.BOOT_PROGRESS_SNAPSHOT),
  getAppVersion: () => ipcRenderer.invoke(IPC.APP_VERSION),
  notifySplashDone: () => ipcRenderer.send(IPC.SPLASH_DONE),
  retryBoot: () => ipcRenderer.send(IPC.BOOT_RETRY),
  continueBootDegraded: () => ipcRenderer.send(IPC.BOOT_CONTINUE_DEGRADED),

  // --- Host platform (drives the macOS traffic-light navbar inset) ---
  platform: process.platform,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('wydAPI', wydAPI);
  } catch (error) {
    console.error('Failed to expose wydAPI:', error);
  }
} else {
  // @ts-expect-error global augmentation for non-isolated context
  window.wydAPI = wydAPI;
}
