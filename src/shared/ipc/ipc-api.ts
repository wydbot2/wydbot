import type { ECharClass } from '../types/game-structures';
import type { MPosition, MScore } from '../types/game-structures';
import type { MAffect, MAffectPacket } from '../types/affect-types';
import type { MItem } from '../types/item-types';
import type { ViewSelChar, Entity } from '../types/game-types';
import type { ServerChannel } from '../constants/server-channels';
import type { AppConfigV1 } from '../app-config';
import type { ItemDb } from '../types/item-db-types';
import type { ComposeCatalog, ComposeWireIngredient } from '../types/compose-types';
import type { DirectionCode, HeightmapPayload } from './walkability';
import type { ProxySettings } from '../proxy-config';

export interface AppError {
  code: string;
  message: string;
  severity: 'warning' | 'error';
  details?: string;
}

export interface IpcLoginSuccess {
  selChar: ViewSelChar;
  accName: string;
  /** Bank storage (cargo) — MItem[128], 120 usable. Arrives once at 0x10A login. */
  cargo: MItem[];
  /** Bank gold balance (cargoCoin) at login. */
  cargoCoin: number;
}

export interface IpcServerMessage {
  subtype: number;
  code: number;
}

export interface IpcCharToWorld {
  position: MPosition;
  finalScore: MScore;
  name: string;
  guildIndex: number;
  charClass: ECharClass;
  gold: number;
  /** Converted from bigint at IPC boundary — may lose precision above 2^53. */
  exp: number;
  clientIndex: number;
  affects: MAffect[];
  mobIndex: number;
  equip: MItem[];
  inventory: MItem[];
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
  cp: number;
  evolutionTier: number;
  /** Raw bitmask — decode with getLearnedSkillIds() from @shared/lib/skill-utils. */
  learnedSkill: [number, number]; // [Learn[0] @ player+0xF20, Learn[1] @ +0xF24]
}

/**
 * `0x165` death / leave transition.
 * Bot: `0` and `>= 3` remove from store; `1` dying; `2` fade.
 */
export interface IpcMobDeathState {
  entityId: number;
  state: number;
}

/**
 * `0x36A` state-delta. All subtypes are forwarded so presence (`lastSeenMs`) can
 * re-stamp; `subType==2` is the REVIVE path (`entity+0x221 = 0`).
 */
export interface IpcMobStateDelta {
  entityId: number;
  subType: number;
}

/**
 * `0x36B` full state+appearance resync event. Defensive landing: payload
 * carries only the entity id; renderer bumps freshness and waits for the next
 * `0x364`/`0x36C` to repopulate visible fields.
 */
export interface IpcMobResync {
  entityId: number;
}

/**
 * Wire field is ObjectManager object id — **not proven equal** to mob slot
 * when `objectId` matches a present entity index; otherwise no-op.
 */
export interface IpcDespawnByObjectId {
  objectId: number;
}

/**
 * Outcome of a single move-chunk request, decided main-side at send time:
 * - `in-progress` — a 0x36C chunk was sent toward `dst`; keep streaming.
 * - `arrived`     — predicted reached the final target; no packet sent.
 * - `replan`      — predicted drifted past the route end; renderer re-plans.
 * - `no-route`    — no active route for the source (race / post-correction); renderer re-plans.
 */
export type MoveChunkStatus = 'in-progress' | 'arrived' | 'replan' | 'no-route';

export interface IpcMoveAnnounced {
  moveId: number;
  dst: MPosition;
  cooldownMs: number;
  status: MoveChunkStatus;
}

export interface IpcMoveEnqueued {
  moveId: number;
  /** Expected total ms until MOVE_ANNOUNCED echo fires (queue wait + travel time). */
  expectedTotalMs: number;
}

export interface IpcMoveRejected {
  moveId: number;
  /** 'queue-stale' (dropped >10s in ActionQueue) | 'no-result' (control.movement returned falsy). */
  reason: string;
}

export interface IpcRubberband {
  pos: MPosition;
  /** Movement epoch after the correction — renderer gates stale position writes by it. */
  epoch: number;
  steering: boolean;
}

export interface IpcTeleport {
  pos: MPosition;
  /** Wire moveType from S2C 0x36c (zone portal reply is typically 1). */
  moveType: number;
  /** Movement epoch after the correction — renderer gates stale position writes by it. */
  epoch: number;
}

/**
 * Dead-reckoned player position broadcast by the main-side MovementState while a
 * move leg is interpolating. The single source the renderer mirrors into the
 * player store — replaces the old send-time position snap.
 */
export interface IpcPlayerPosition {
  x: number;
  y: number;
  /** Movement epoch this tick belongs to; renderer ignores ticks older than the latest. */
  epoch: number;
}

export interface IpcMobMove {
  clientId: number;
  lastPosition: MPosition;
  destiny: MPosition;
  moveType: number;
  speedMove: number;
  /** Direction codes the server walks (`0x36C` command string), parsed into DIR codes. */
  codes: DirectionCode[];
}

export interface IpcRefreshScore {
  score: MScore;
  currentHp: number;
  currentMp: number;
  clientId: number;
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
  /**
   * Live affect state (32 entries × `MAffectPacket`). Empty slots have
   * `timeOctets === 0`. Server-driven; client never decrements.
   */
  affects: MAffectPacket[];
}

/**
 * Absolute HP/MP sync for a remote entity (0x336 remote + 0x181 remote).
 * `currHp`/`currMp` are absolute values; the renderer clamps and revives.
 */
export interface IpcMobHpSync {
  clientId: number;
  currHp: number;
  currMp: number;
}

/** Absolute HP/MP sync for the local player (0x181 / 0x18A local branch). */
export interface IpcPlayerHpMpSync {
  currentHp: number;
  currentMp?: number;
}

/**
 * Per-slot delta update (S2C 0x182). For mount HP runtime updates the server
 * pushes sub=0 slot=14 with bytes 6-7 of the MItem holding the new MOUNTHP.
 */
export interface IpcSlotDeltaUpdate {
  /** 0=equipment slot (0..15), 1=inventory slot (0..63), 2=bank storage (0..119). */
  subType: number;
  slotIndex: number;
  item: MItem;
}

/** S2C 0x376 item-move echo — apply a two-slot swap (kind: 0=equip,1=bag,2=storage). */
export interface IpcItemMoveEcho {
  dstKind: number;
  dstSlot: number;
  srcKind: number;
  srcSlot: number;
}

export interface IpcChatMessage {
  message: string;
  clientId: number;
}

export interface IpcChatBroadcast {
  message: string;
}

export interface IpcWhisperMessage {
  command: string;
  message: string;
}

export interface IpcMobDeath {
  killed: number;
  killer: number;
  exp: number;
}

/**
 * Inbound damage event (0x39D/0x39E/0x367). Per-target damage parsed from the
 * wire `+0x3C` array; forwarded to the renderer for HP tracking.
 */
export interface IpcSingleAttackInbound {
  attackerIndex: number;
  targets: { targetIndex: number; damage: number }[];
  skillCode: number;
}

export interface IpcNpcMenuData {
  question: string;
  answers: [string, string, string, string];
}

export interface IpcLogEntry {
  level: string;
  message: string;
  timestamp: string;
  category?: string;
}

/**
 * Stages emitted on `IPC.BOOT_PROGRESS` during cold/warm app boot.
 *   `window-create` → React mounted, main about to start cache warming.
 *   `icons`/`maps`/`amul` → per-cache extraction in progress.
 *   `itemdb` → unified item/skill DB build (after the icon cache, which it reads).
 *   `ready` → all caches AND the ItemDb ready; renderer may transition to login.
 *
 *   `assets-checking`/`assets-downloading`/`assets-extracting` → game-asset
 *   gate (emitted by `src/main/asset-update/` before cache warming).
 */
export type BootStage =
  | 'window-create'
  | 'assets-checking'
  | 'assets-downloading'
  | 'assets-extracting'
  | 'icons'
  | 'maps'
  | 'amul'
  | 'itemdb'
  | 'ready'
  | 'error';

export interface IpcBootProgress {
  stage: BootStage;
  stageIndex: number;
  stageCount: number;
  /** 0..100, monotonically non-decreasing within a boot session. */
  percent: number;
  /** Primary title text shown to the user (pt-BR). */
  label: string;
  /** Optional monospace sub-label (e.g. `1234/3668 ícones`). */
  detail?: string;
  /** Set only when stage === 'error'. Raw error message or code. */
  errorCode?: string;
  /** Set only when stage === 'error'. User-facing recovery hint (pt-BR). */
  errorHint?: string;
  /**
   * Set on a boot-critical asset-validation error when a store already exists on
   * disk: enables the "Continuar com dados anteriores" splash action, which
   * proceeds on the current (degraded) store WITH a visible in-game banner —
   * never a silent auto-continue.
   */
  canContinueDegraded?: boolean;
}

export interface ConnectPayload {
  server: ServerChannel;
  proxy: ProxySettings;
}

export type ProxyConnectionStatus =
  | { phase: 'downloading' }
  | { phase: 'testing'; current: number; total: number }
  | { phase: 'connected'; proxy: string; latencyMs: number }
  | { phase: 'failed'; message: string };

export interface LoginPayload {
  username: string;
  password: string;
  /** UUID seed; main derives GUID + MAC from it and the real host MAC. */
  hardwareIdentitySeed?: string | null;
}

export interface HardwareIdentityPreview {
  mac: string;
}

export interface TokenPayload {
  password: string;
  isChanging: number;
}

export interface CharSelectPayload {
  charIndex: number;
}

export interface MovePayload {
  /** Monotonic id correlating this request to its MOVE_ANNOUNCED/REJECTED echo. */
  moveId: number;
  /** Target tile. For a route-driven move (`source` set) this is the FINAL destination. */
  destiny: MPosition;
  moveType: number;
  speedMove: number;
  /** Set → route-driven (main slices route[source] from its predicted); absent → straight-line. */
  source?: string;
  /** Exact-tile arrival (no ARRIVE_EPSILON). */
  exact?: boolean;
}

/** Pushes a planned route to main so the mover re-slices it per chunk (route-driven moves). */
export interface MoveSetRoutePayload {
  source: string;
  tiles: readonly MPosition[];
  codes: readonly DirectionCode[];
  /** Greedy-reachable leg boundaries (indices into `tiles`); see StreamRoute.waypoints. */
  waypoints?: readonly number[];
}

/**
 * Attacker position is sourced from MovementState in main (authoritative),
 * never from the renderer — IPC trust boundary.
 *
 * Multi-target skill casts: `targetIndex` is primary; `extraTargetIndexes`
 * are secondary slots. `packetKind` (SkillData) selects opcode/size
 * (1→0x39D, 2→0x39E, else→0x367). Omitted/`skillId===0` → basic attack.
 */
export interface AttackPayload {
  targetIndex: number;
  targetPosition: MPosition;
  skillId: number;
  /** SkillData.packetKind — defaults to 1 (single-target) when omitted. */
  packetKind?: number;
  /** Secondary..N target mob indexes (not including primary). Max 12. */
  extraTargetIndexes?: readonly number[];
}

/**
 * Attacker position is authoritative (see AttackPayload). `packetKind` is
 * restricted to {0, 1} by the runtime schema — only 1→0x39D
 * (self) and 0→0x367 (generic) are valid SkillData.bin dispatch values.
 */
export interface CastBuffPayload {
  skillId: number;
  packetKind: 0 | 1;
}

export interface NpcClickPayload {
  targetMobIndex: number;
}

/** Item MOVE/relocate (0x376). kind: 0=equip, 1=bag, 2=storage. */
export interface ItemMovePayload {
  srcKind: number;
  srcSlot: number;
  dstKind: number;
  dstSlot: number;
  /** Banker mobIndex stamped at 0x376 +0x10; omit (0) for a plain bag drag. */
  bankerId?: number;
}

/** Item DESTROY (0x02E4) — game discard. Server cross-checks
 *  the (slot, itemId) pair against the live inventory to defeat slot races. */
export interface ItemDestroyPayload {
  slot: number;
  itemId: number;
}

/** Main→renderer: an enqueued DESTROY never reached the wire (ActionQueue stale-drop).
 *  The renderer optimistically cleared the slot on emit — this event triggers the restore. */
export interface IpcItemDestroyFailed {
  slot: number;
  itemId: number;
  /** 'queue-stale' (dropped >10s in ActionQueue). */
  reason: string;
}

/**
 * Use-item (0x373 Form A USE). 36-byte frame; wire body carries `slot` +
 * `feedMarker` + player coords (filled in main from MovementState). `itemId`
 * is forwarded for diagnostic logging only — the wire does NOT include it
 * (the server reads server-side inventory[slot]). The renderer validates that
 * `inventory[slot].index === itemId` BEFORE sending (game-api.ts useItem wrapper).
 *
 * `feedMarker` semantics: `0` for HP/MP potion or herb (categories 1, 0xF2,
 * 0xF3); `0xE` for mount feed (category 0xF). See
 * A discriminators".
 */
export interface UseItemPayload {
  slot: number;
  itemId: number;
  feedMarker: 0 | 0xe;
}

/**
 * Hunt-scroll teleport (0x3AE arm → ~5 s → 0x373). The renderer sends the
 * desired destination as raw tile `(destX, destY)`; main re-validates the scroll
 * id and snaps the coordinate to a `PotalPos` destination (the wire carries only
 * the resolved 1-based menu index). `scrollId` correlates the async DONE echo.
 */
export interface UseTeleportScrollPayload {
  scrollId: number;
  slot: number;
  itemId: number;
  destX: number;
  destY: number;
}

/**
 * Return scroll (Pergaminho Retorno) recall: 0x3AE arm → ~5 s → 0x373 (`+0x20=0`).
 * No destination — the server owns the fixed return point. `scrollId` correlates
 * the async DONE echo (reuses `TELEPORT_SCROLL_DONE` / `TeleportScrollOutcome`).
 */
export interface UseReturnScrollPayload {
  scrollId: number;
  slot: number;
  itemId: number;
}

/** Terminal result of a teleport-scroll request, echoed once main resolves it. */
export type TeleportScrollOutcome = 'ok' | 'bad-item' | 'bad-dest' | 'queue-stale';

/** Post-resolution echo of a hunt-scroll request (mirrors the MOVE_ANNOUNCED model). */
export interface IpcTeleportScrollDone {
  scrollId: number;
  outcome: TeleportScrollOutcome;
}

/** Bank gold deposit/withdraw (0x388/0x387) — amount only. */
export interface BankGoldPayload {
  amount: number;
}

/** Composition submit (0x2e7) — recipe index + gathered ingredients (item + bag slot).
 *  The `qty` field in each ingredient is always 0 on the wire. */
export interface ComposeSubmitPayload {
  recipeIndex: number;
  ingredients: ComposeWireIngredient[];
}

/** Shop buy (0x379) — purchase one item from the merchant NPC. */
export interface ShopBuyPayload {
  npcIndex: number;
  /** Linear shop panel slot from live 0x17C (0..26); encoded to wire in the packet builder. */
  slotIndex: number;
  bagSlot: number;
}

/** Shop inventory item forwarded to the renderer (one slot in the 0x17C data). */
export interface IpcShopItem {
  itemId: number;
  price: number;
  slotIndex: number;
}

/** S2C 0x17C shop inventory data relayed to the renderer. */
export interface IpcShopInventory {
  subType: number;
  items: IpcShopItem[];
}

/** Main→renderer: hand gold delta (0x171/0x387/0x388/0x37A/0x1BF).
 *  Positive = incoming gold (loot/withdraw/sell/trade), negative = outgoing (deposit). */
export interface IpcHandGoldDelta {
  delta: number;
}

/** Main→renderer: 0x171 trade-item-add payload. May be a normal item or gold credit.
 *  Renderer uses ItemDb to detect gold branch (eff(itemId,0x26)==2). */
export interface IpcTradeItemAdd {
  slot: number;
  item: MItem;
}

/** Main→renderer: 0x37A sell-result. Renderer zeroes sold slot + computes gold payout. */
export interface IpcSellResult {
  slot: number;
}

/** Main→renderer: 0x3AF absolute hand gold value. Sent after MobDeath. */
export interface IpcHandGoldSet {
  gold: number;
}

/** Main→renderer: 0x1BF trade-result. Gold from trade (already modulo 100M by server). */
export interface IpcTradeResult {
  gold: number;
}

export interface MiniPopupClickPayload {
  buttonIndex: number;
}

export interface ChatPayload {
  message: string;
}

export interface WhisperPayload {
  command: string;
  message: string;
}

/**
 * Host operating system, mirrored from `process.platform` in the (privileged)
 * preload. A string-literal union (NOT `NodeJS.Platform`) so it type-checks in
 * the renderer build, which compiles with `types: []` (no `@types/node`).
 */
export type HostPlatform =
  | 'aix'
  | 'android'
  | 'cygwin'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'netbsd'
  | 'openbsd'
  | 'sunos'
  | 'win32';

/** Renderer→main: invite a nearby player to the party by server charIndex. */
export interface PartyInvitePayload {
  /** Target player's server charIndex (== `entity.index`). */
  targetIndex: number;
}

/** Renderer→main: accept a pending party invite from a given inviter. */
export interface PartyAcceptPayload {
  /** Inviter's server charIndex (from the invite notification). */
  inviterIndex: number;
  /** Inviter's name — echoed into the accept packet body (faithful to canonical). */
  inviterName: string;
}

/** Main→renderer: a party invite arrived (relayed S2C `0x37f`). */
export interface IpcPartyInviteReceived {
  inviterIndex: number;
  inviterName: string;
}

/** Main→renderer: one party roster member (S2C `0x37d`). Upserted by charIndex. */
export interface IpcPartyRosterMember {
  charIndex: number;
  name: string;
  isLeader: boolean;
}

/** Main→renderer: a member left / party dissolved (S2C `0x37e`). `0` = dissolve. */
export interface IpcPartyLeft {
  charIndex: number;
}

export interface WydBotAPI {
  connect(payload: ConnectPayload): void;
  disconnect(): void;
  onConnectionStatus(
    callback: (status: 'connected' | 'disconnected' | 'error') => void,
  ): () => void;
  onProxyConnectionStatus(callback: (status: ProxyConnectionStatus) => void): () => void;

  login(payload: LoginPayload): void;
  onLoginSuccess(callback: (data: IpcLoginSuccess) => void): () => void;
  onServerMessage(callback: (data: IpcServerMessage) => void): () => void;

  submitToken(payload: TokenPayload): void;
  onTokenResponse(callback: (success: boolean) => void): () => void;

  onCharList(callback: (data: ViewSelChar) => void): () => void;
  selectChar(payload: CharSelectPayload): void;

  onCharToWorld(callback: (data: IpcCharToWorld) => void): () => void;
  charLogout(): void;
  onCharLogoutSignal(callback: () => void): () => void;

  onCreateMob(callback: (data: Entity) => void): () => void;
  onMobDeathState(callback: (data: IpcMobDeathState) => void): () => void;
  onMobStateDelta(callback: (data: IpcMobStateDelta) => void): () => void;
  onMobResync(callback: (data: IpcMobResync) => void): () => void;
  onMobDeath(callback: (data: IpcMobDeath) => void): () => void;
  onDespawnByObjectId(callback: (data: IpcDespawnByObjectId) => void): () => void;
  onEntitiesReset(callback: () => void): () => void;
  onSingleAttackInbound(callback: (data: IpcSingleAttackInbound) => void): () => void;
  onRefreshScore(callback: (data: IpcRefreshScore) => void): () => void;
  onMobHpSync(callback: (data: IpcMobHpSync) => void): () => void;
  onPlayerHpMpSync(callback: (data: IpcPlayerHpMpSync) => void): () => void;
  onSlotDeltaUpdate(callback: (data: IpcSlotDeltaUpdate) => void): () => void;
  onItemMoveEcho(callback: (data: IpcItemMoveEcho) => void): () => void;
  onBankGoldBalance(callback: (data: { balance: number }) => void): () => void;
  onHandGoldDelta(callback: (data: IpcHandGoldDelta) => void): () => void;
  onHandGoldSet(callback: (data: IpcHandGoldSet) => void): () => void;
  onTradeItemAdd(callback: (data: IpcTradeItemAdd) => void): () => void;
  onSellResult(callback: (data: IpcSellResult) => void): () => void;
  onTradeResult(callback: (data: IpcTradeResult) => void): () => void;

  move(payload: MovePayload): void;
  setMoveRoute(payload: MoveSetRoutePayload): void;
  onMoveEnqueued(callback: (data: IpcMoveEnqueued) => void): () => void;
  onMoveAnnounced(callback: (data: IpcMoveAnnounced) => void): () => void;
  onMoveRejected(callback: (data: IpcMoveRejected) => void): () => void;
  onPlayerPosition(callback: (data: IpcPlayerPosition) => void): () => void;
  onMobMove(callback: (data: IpcMobMove) => void): () => void;

  attack(payload: AttackPayload): void;
  castBuff(payload: CastBuffPayload): void;
  respawn(): void;
  npcClick(payload: NpcClickPayload): void;
  dialogClick(payload: NpcClickPayload): void;
  miniPopupClick(payload: MiniPopupClickPayload): void;
  useZonePortal(): void;
  itemMove(payload: ItemMovePayload): void;
  itemDestroy(payload: ItemDestroyPayload): void;
  onItemDestroyFailed(callback: (data: IpcItemDestroyFailed) => void): () => void;
  useItem(payload: UseItemPayload): void;
  useTeleportScroll(payload: UseTeleportScrollPayload): void;
  useReturnScroll(payload: UseReturnScrollPayload): void;
  onTeleportScrollDone(callback: (data: IpcTeleportScrollDone) => void): () => void;
  bankDepositGold(payload: BankGoldPayload): void;
  bankWithdrawGold(payload: BankGoldPayload): void;
  composeSubmit(payload: ComposeSubmitPayload): void;
  shopBuy(payload: ShopBuyPayload): void;
  onShopInventory(callback: (data: IpcShopInventory) => void): () => void;
  partyInvite(payload: PartyInvitePayload): void;
  partyAccept(payload: PartyAcceptPayload): void;
  partyLeave(): void;
  onPartyInviteReceived(callback: (data: IpcPartyInviteReceived) => void): () => void;
  onPartyRosterUpdate(callback: (data: IpcPartyRosterMember) => void): () => void;
  onPartyLeft(callback: (data: IpcPartyLeft) => void): () => void;
  onRubberband(callback: (data: IpcRubberband) => void): () => void;
  onTeleport(callback: (data: IpcTeleport) => void): () => void;

  sendMessage(payload: ChatPayload): void;
  sendWhisper(payload: WhisperPayload): void;
  onChatMessage(callback: (data: IpcChatMessage) => void): () => void;
  onChatBroadcast(callback: (data: IpcChatBroadcast) => void): () => void;
  onWhisperMessage(callback: (data: IpcWhisperMessage) => void): () => void;
  onGameMessage(callback: (message: string) => void): () => void;

  onNpcMenuData(callback: (data: IpcNpcMenuData) => void): () => void;

  onAppError(callback: (error: AppError) => void): () => void;

  onLogBatch(callback: (entries: IpcLogEntry[]) => void): () => void;
  sendRendererLog(entry: IpcLogEntry): void;

  loadServerlist(): Promise<ServerChannel[]>;

  loadStrdef(): Promise<string[]>;

  /** Machine-binding key (stable per-machine id). Do not log. */
  getMachineBindingKey(): Promise<string>;
  previewHardwareIdentity(identitySeed: string): Promise<HardwareIdentityPreview>;

  /**
   * Returns the canonical 4096×4096 i8 world heightmap (built from all
   * `Field*.trn` sectors) plus its metadata. Called ONCE at boot; the
   * renderer caches the buffer and serves every walkability query
   * (canStep/searchRoute/hasLineOfWalk) locally.
   */
  getWalkabilityHeightmap(): Promise<HeightmapPayload>;

  /** Returns the unified item database (cached after first call). */
  getItemDb(): Promise<ItemDb>;

  /** Returns the composition (Item-Mix) recipe catalog (cached after first call). */
  getComposeCatalog(): Promise<ComposeCatalog>;

  /**
   * Optional `payload.path`: when provided, reads the file directly (used by
   * "Recentes"); otherwise shows the OS native open dialog.
   *
   * Result is discriminated on `ok`: `{ ok: true, config, path }` on success,
   * `null` on user-cancel, and `{ ok: false, raw, path }` when the file failed
   * schema validation — `raw` is the parsed-but-invalid JSON so the renderer can
   * re-validate and surface per-issue errors (a thrown ZodError loses `.issues`
   * across IPC).
   */
  openAppConfig(payload?: {
    path?: string;
  }): Promise<
    | { ok: true; config: AppConfigV1; path: string }
    | { ok: false; raw: unknown; path: string }
    | null
  >;

  /**
   * `payload.path === null` triggers the native save dialog; otherwise writes
   * directly to the given path.
   */
  saveAppConfig(payload: {
    config: AppConfigV1;
    path: string | null;
  }): Promise<{ path: string } | null>;

  /** Opens the Script API documentation in a secondary BrowserWindow. */
  openDocs(): Promise<void>;

  /** Boot-time progress stream emitted by main during cache warming. */
  onBootProgress(callback: (data: IpcBootProgress) => void): () => void;

  /**
   * Snapshot of the last `BOOT_PROGRESS` emission (or `null` if none yet).
   * Renderer queries this on mount to catch up if events fired before subscribe.
   */
  getBootProgressSnapshot(): Promise<IpcBootProgress | null>;

  /** Returns `app.getVersion()` — reads `package.json` at runtime. */
  getAppVersion(): Promise<string>;

  /**
   * Signals main that the splash has finished (renderer transitioned past it).
   * Main responds by resizing the BrowserWindow to the game-view dimensions.
   */
  notifySplashDone(): void;

  /**
   * Requests main to retry the cache-initialization sequence after a boot error.
   * Main re-emits progress events starting from the failed stage.
   */
  retryBoot(): void;

  /**
   * Proceeds past a boot-critical asset-validation error using the current
   * (degraded) store instead of retrying. Only offered when a store exists; the
   * client enters with a persistent "dados incompletos" banner — never silently.
   */
  continueBootDegraded(): void;

  /**
   * Host OS, mirrored from `process.platform` in the preload. Read once at
   * startup; drives the macOS-only traffic-light inset on the top navbar.
   */
  readonly platform: HostPlatform;
}
