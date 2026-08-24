/**
 * All packet opcodes used in the WYD2 protocol.
 * Extracted from IncomingPacketStructure, OutgoingPacketStructure, and ClientConnection.
 */

// --- Incoming (Server -> Client) ---
export const OPCODE_CLIENT_MESSAGE_TEXT = 0x101 as const;
export const OPCODE_SERVER_MESSAGE = 0x105 as const;
export const OPCODE_GAME_MESSAGE_UNKNOWN = 0x106 as const;
export const OPCODE_LOGIN_SUCCESSFUL = 0x10a as const;
export const OPCODE_RESEND_CHAR_LIST = 0x110 as const;
export const OPCODE_CHAR_TO_WORLD = 0x114 as const;
export const OPCODE_CHAR_LOGOUT_SIGNAL = 0x116 as const;
export const OPCODE_MOB_DEATH_STATE = 0x165 as const;
// Log-only; no server behavior to mirror.
export const OPCODE_DESPAWN_BY_OBJECT_ID = 0x16f as const;
// Clears the revive flag when HP>0. Per-entity (local player + remote mobs).
export const OPCODE_COMPACT_HP_MP_SYNC = 0x181 as const;
export const OPCODE_SLOT_DELTA_UPDATE = 0x182 as const;
export const OPCODE_DAMAGE_EVENT = 0x18a as const;
// `subType==2` is acted on (REVIVE / clear isDead).
// `subType==1` (death-grace) and `subType==3` (spawn FX) are ignored — they
// produce no entity-field writes.
export const OPCODE_MOB_STATE_DELTA = 0x36a as const;
// Scene reset (kick-to-menu): mode i16 @pkt+0x10, 10..19 → char-select,
// `==0x16 && level<1000` → local death, else → server-select. Entities clear only as a
// scene-teardown side effect. Log-only. Do NOT emit
// a wipe — that fabricates behavior.
export const OPCODE_SERVER_MULTI_SIGNAL = 0x292 as const;
// Multi-signal (morph/respawn/polymorph). Our defensive landing: only bump `lastSeenMs` so
// the freshness guard accepts the next `0x364`/`0x36c` immediately. Full equip
// re-derive deferred (subType==1 semantics still open).
export const OPCODE_MOB_RESYNC = 0x36b as const;

// --- NPC interaction (incoming) ---
export const OPCODE_NPC_TELEPORT_COMMAND = 0x1c1 as const;
export const OPCODE_NPC_MENU_DATA = 0x1c6 as const;

export const OPCODE_SERVER_SYNC = 0x3b9 as const; // 268-byte ServerSync; we do not reply
export const OPCODE_CHALLENGE = 0xbbf as const;

// --- Bidirectional (same opcode for in/out) ---
export const OPCODE_ACCOUNT_LOGIN = 0x20d as const;
export const OPCODE_CHAT_MESSAGE = 0x333 as const;
export const OPCODE_CHAT_BROADCAST = 0xd1d as const;
export const OPCODE_WHISPER_MESSAGE = 0x334 as const;
export const OPCODE_REFRESH_SCORE = 0x336 as const;
export const OPCODE_MOB_DEATH = 0x338 as const;
// `0x363` named-special-spawn (event/GM/boss "FM"). Same handler entry as
// `0x364`; canonical forces `ClassId=0xE6` and `HP=15000` and
// copies `pkt+0xfd` as override name. We dispatch through the same parser as
// `0x364` and trust the wire (name termination and server emission still open).
export const OPCODE_CREATE_MOB_NAMED = 0x363 as const;
export const OPCODE_CREATE_MOB = 0x364 as const;
export const OPCODE_MOVE_RESPONSE = 0x366 as const; // Server -> Client: same structure as 0x36C
export const OPCODE_MOVE = 0x36c as const;
export const OPCODE_SINGLE_ATTACK = 0x39d as const;
export const OPCODE_AOE_ATTACK = 0x39e as const;
export const OPCODE_SKILL_ATTACK = 0x367 as const;

// --- Outgoing (Client -> Server) ---
export const OPCODE_REQUEST_MOB_LOGIN = 0x213 as const;
export const OPCODE_CHAR_LOGOUT = 0x215 as const;
export const OPCODE_RESPAWN_EXECUTE = 0x289 as const;

// `0x3A0` client→server idle keepalive: 12-byte header-only, player mobIndex at
// wire+6 (a world-addressed packet, like move/attack). Sent by the KeepAlive
// timer to keep outbound traffic inside the server's idle window. See
export const OPCODE_KEEPALIVE = 0x3a0 as const;

// --- Item (outgoing) ---
// Multiplexed generic item-MOVE opcode (≥6 emit branches, no enum byte —
// server demuxes by body shape + byte-0/byte-2). We build the two-slot MOVE
// srcKind,srcSlot}:u8 + u32=0. Grouping/stacking is the same-item bag→bag case
// of this generic move (server coalesces). See
// item-MOVE sub-form".
export const OPCODE_ITEM_MOVE = 0x376 as const;

// Canonical item-destroy ("trash-bin") opcode. 20-byte frame, body
// {u32 slot, u32 itemId}. No VOLATILE-sum gate, no NPC sentinel, no
// player-coord proximity check — equipment passes through. Identified by
// round-trip byte-exact verified via decode.mjs. Emitter symbol in WYD.exe
// not yet localized (opcode loaded indirectly — table-driven or computed).
export const OPCODE_ITEM_DESTROY = 0x02e4 as const;

// Multiplexed C2S use/throw/move opcode (Form A USE + Form B MOVE). 36-byte
// frame (0x24); Form A is gated by non-zero player coords at +0x1C/+0x1E (USE)
// and discriminates feed-vs-potion by `+0x18 = 0xE` (mount feed) | `0` (potion
// or herb). Wire body is field-exact.
export const OPCODE_USE_ITEM = 0x373 as const;

// Channel-arm for the hunt-scroll teleport sequence. 16-byte frame, Mode=1 u32
// flushes the stashed 0x373 (slot + menu index at +0x20). See
// flow".
export const OPCODE_USE_ITEM_ARM = 0x3ae as const;

// dialog). 16-byte frame, amount u32 @+0x0C. Inbound 0x339 = absolute bank-gold
// balance (parsed in a later phase).
export const OPCODE_BANK_GOLD_DEPOSIT = 0x388 as const;
export const OPCODE_BANK_GOLD_WITHDRAW = 0x387 as const;
export const OPCODE_BANK_GOLD_BALANCE = 0x339 as const;

// Wire: discriminator(u16@+0x0C) + slot(i32@+0x10) + MItem(12B@+0x14).
// Gold detection: GetItemEffectValue(item,0x26)==2 → credit eff[0x24]*256+eff[0x25].
export const OPCODE_TRADE_ITEM_ADD = 0x171 as const;

// Wire: ctx(u16@+0x0C) + sub(i16@+0x0E) + slot(i16@+0x10).
export const OPCODE_SELL_RESULT = 0x37a as const;

// Wire: rowFlags[5](u8@+0x0C) + itemId(u8@+0x0D) + … + gold(u32@+0x20).
// Gold branch: itemId==0x0E → handGold += gold % 100_000_000.
export const OPCODE_TRADE_RESULT = 0x1bf as const;

// S2C hand gold absolute update (16 bytes, body u32 = absolute gold).
// KG name: PostShopBuySignal — fired after shop buy AND after MobDeath loot.
export const OPCODE_HAND_GOLD_UPDATE = 0x3af as const;

// Composition (Item-Mix) submit; 120-byte frame. Builder buildComposeSubmitPacket (wire partially verified).
export const OPCODE_COMPOSE_SUBMIT = 0x2e7 as const;

// --- Party / grupo (bidirectional; see ) ---
export const OPCODE_PARTY_INVITE = 0x37f as const;
export const OPCODE_PARTY_ACCEPT = 0x3ab as const;
// 0x37e LEAVE party (C2S), 16-byte header-only-ish frame.
export const OPCODE_PARTY_LEAVE = 0x37e as const;
export const OPCODE_PARTY_ROSTER_MEMBER = 0x37d as const;
export const OPCODE_PARTY_ROSTER_FINALIZE = 0x3ea as const;

// --- NPC interaction (outgoing) ---
export const OPCODE_NPC_CLICK = 0x28b as const;
export const OPCODE_DIALOG_CLICK = 0x27b as const;
export const OPCODE_ZONE_PORTAL = 0x290 as const;
export const OPCODE_SHOP_INVENTORY = 0x17c as const;
export const OPCODE_SHOP_BUY = 0x379 as const;
export const OPCODE_TELEPORT_CONFIRM = 0x2c2 as const;
export const OPCODE_MINIPOPUP_CLICK = 0x2c7 as const;
export const OPCODE_MINIPOPUP_SELECTION = 0x378 as const;
export const OPCODE_DIALOG_CLOSE = 0x384 as const;

export const OPCODE_TOKEN = 0xfde as const;
export const OPCODE_TOKEN_INCORRECT = 0xfdf as const;
