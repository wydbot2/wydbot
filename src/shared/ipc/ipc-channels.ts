export const IPC = {
  CONNECT: 'wyd:connect',
  DISCONNECT: 'wyd:disconnect',
  CONNECTION_STATUS: 'wyd:connection-status',
  PROXY_CONNECTION_STATUS: 'wyd:proxy-connection-status',

  LOGIN: 'wyd:login',
  LOGIN_SUCCESS: 'wyd:login-success',
  SERVER_MESSAGE: 'wyd:server-message',
  TOKEN_SUBMIT: 'wyd:token-submit',
  TOKEN_RESPONSE: 'wyd:token-response',

  CHAR_LIST: 'wyd:char-list',
  CHAR_SELECT: 'wyd:char-select',

  CHAR_TO_WORLD: 'wyd:char-to-world',
  CHAR_LOGOUT: 'wyd:char-logout',
  CHAR_LOGOUT_SIGNAL: 'wyd:char-logout-signal',

  CREATE_MOB: 'wyd:create-mob',
  MOB_DEATH_STATE: 'wyd:mob-death-state',
  MOB_STATE_DELTA: 'wyd:mob-state-delta',
  MOB_RESYNC: 'wyd:mob-resync',
  MOB_DEATH: 'wyd:mob-death',
  /** Soft despawn `0x16f` — best-effort remove when objectId matches a store index. */
  DESPAWN_BY_OBJECT_ID: 'wyd:despawn-by-object-id',
  ENTITIES_RESET: 'wyd:entities-reset',
  SINGLE_ATTACK_INBOUND: 'wyd:single-attack-inbound',
  REFRESH_SCORE: 'wyd:refresh-score',
  MOB_HP_SYNC: 'wyd:mob-hp-sync',
  PLAYER_HP_MP_SYNC: 'wyd:player-hp-mp-sync',
  SLOT_DELTA_UPDATE: 'wyd:slot-delta-update',
  ITEM_MOVE_ECHO: 'wyd:item-move-echo',
  BANK_GOLD_BALANCE: 'wyd:bank-gold-balance',
  HAND_GOLD_DELTA: 'wyd:hand-gold-delta',
  HAND_GOLD_SET: 'wyd:hand-gold-set',
  TRADE_ITEM_ADD: 'wyd:trade-item-add',
  SELL_RESULT: 'wyd:sell-result',
  TRADE_RESULT: 'wyd:trade-result',

  MOVE: 'wyd:move',
  MOVE_SET_ROUTE: 'wyd:move-set-route',
  MOVE_ENQUEUED: 'wyd:move-enqueued',
  MOVE_ANNOUNCED: 'wyd:move-announced',
  MOVE_REJECTED: 'wyd:move-rejected',
  PLAYER_POSITION: 'wyd:player-position',
  MOB_MOVE_RECEIVED: 'wyd:mob-move-received',

  ATTACK: 'wyd:attack',
  CAST_BUFF: 'wyd:cast-buff',
  RESPAWN: 'wyd:respawn',
  NPC_CLICK: 'wyd:npc-click',
  DIALOG_CLICK: 'wyd:dialog-click',
  MINIPOPUP_CLICK: 'wyd:minipopup-click',
  USE_ZONE_PORTAL: 'wyd:use-zone-portal',
  ITEM_MOVE: 'wyd:item-move',
  ITEM_DESTROY: 'wyd:item-destroy',
  ITEM_DESTROY_FAILED: 'wyd:item-destroy-failed',
  USE_ITEM: 'wyd:use-item',
  USE_TELEPORT_SCROLL: 'wyd:use-teleport-scroll',
  USE_RETURN_SCROLL: 'wyd:use-return-scroll',
  TELEPORT_SCROLL_DONE: 'wyd:teleport-scroll-done',
  BANK_GOLD_DEPOSIT: 'wyd:bank-gold-deposit',
  BANK_GOLD_WITHDRAW: 'wyd:bank-gold-withdraw',
  COMPOSE_SUBMIT: 'wyd:compose-submit',
  SHOP_INVENTORY: 'wyd:shop-inventory',
  SHOP_BUY: 'wyd:shop-buy',
  RUBBERBAND: 'wyd:rubberband',
  TELEPORT: 'wyd:teleport',

  SEND_MESSAGE: 'wyd:send-message',
  CHAT_MESSAGE: 'wyd:chat-message',
  CHAT_BROADCAST: 'wyd:chat-broadcast',
  WHISPER_MESSAGE: 'wyd:whisper-message',
  GAME_MESSAGE: 'wyd:game-message',
  GAME_MESSAGE_UNKNOWN: 'wyd:game-message-unknown',

  NPC_MENU_DATA: 'wyd:npc-menu-data',

  // --- Party (grupo) ---
  PARTY_INVITE: 'wyd:party-invite', // renderer→main command
  PARTY_ACCEPT: 'wyd:party-accept', // renderer→main command
  PARTY_LEAVE: 'wyd:party-leave', // renderer→main command
  PARTY_INVITE_RECEIVED: 'wyd:party-invite-received', // main→renderer event
  PARTY_ROSTER_UPDATE: 'wyd:party-roster-update', // main→renderer event
  PARTY_LEFT: 'wyd:party-left', // main→renderer event

  APP_ERROR: 'wyd:app-error',
  APP_VERSION: 'wyd:app-version',
  BOOT_PROGRESS: 'wyd:boot-progress',
  BOOT_PROGRESS_SNAPSHOT: 'wyd:boot-progress-snapshot',
  BOOT_RETRY: 'wyd:boot-retry',
  BOOT_CONTINUE_DEGRADED: 'wyd:boot-continue-degraded',
  SPLASH_DONE: 'wyd:splash-done',

  LOG_BATCH: 'wyd:log-batch',
  RENDERER_LOG: 'wyd:renderer-log',

  SERVERLIST_LOAD: 'wyd:serverlist-load',
  STRDEF_LOAD: 'wyd:strdef-load',

  /** Device bind token (`p_machine_token`) — reconnect bag key. */
  MACHINE_BINDING_KEY: 'wyd:machine-binding-key',
  /** Session-only MAC preview derived in main from host MAC + random UUID. */
  HARDWARE_IDENTITY_PREVIEW: 'wyd:hardware-identity-preview',

  WALKABILITY_GET_HEIGHTMAP: 'walkability:get-heightmap',

  DATA_GET_ITEM_DB: 'data:get-item-db',
  DATA_GET_COMPOSE_CATALOG: 'data:get-compose-catalog',

  APP_CONFIG_OPEN: 'app-config:open',
  APP_CONFIG_SAVE: 'app-config:save',

  DOCS_OPEN: 'docs:open',

  RUNTIME_FAULT: 'wyd:runtime-fault',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
