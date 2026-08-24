/**
 * FACADE: Main Process → Server (Commands → Packets → TCP)
 *
 * Exposes domain-level methods (login, move, attack, chat) that build
 * outgoing packets and send them through ClientConnection.
 *
 *   control.login(...)              ← domain command
 *   buildAccountLoginPacket(...)    → packet Buffer
 *   connection.send(buffer)         → TCP socket
 */
import type { MPosition } from '@shared/types/game-structures';
import type { ComposeWireIngredient } from '@shared/types/compose-types';
import { DIR_DELTA, type DirectionCode } from '@shared/ipc/walkability';
import type { MoveChunkStatus } from '@shared/ipc/ipc-api';
import {
  OPCODE_CHAR_LOGOUT,
  OPCODE_KEEPALIVE,
  OPCODE_SINGLE_ATTACK,
  OPCODE_SKILL_ATTACK,
  OPCODE_CHAT_MESSAGE,
  OPCODE_WHISPER_MESSAGE,
  OPCODE_RESPAWN_EXECUTE,
  OPCODE_BANK_GOLD_DEPOSIT,
  OPCODE_BANK_GOLD_WITHDRAW,
} from '@shared/constants/opcodes';
import { chebyshev, moveStepCount, speedTierFloorMs } from '@shared/lib/movement-math';
import {
  ARRIVE_EPSILON,
  MAX_EXECUTION_DISTANCE,
  ORIGIN_REANCHOR_TOLERANCE,
} from '@shared/constants/movement';
import {
  HUNT_SCROLL_CATALOG,
  resolveHuntScrollDestination,
} from '@shared/constants/hunt-scroll-catalog';
import { CHANNEL_SCROLL_IDS } from '@shared/constants/item-use-kind';
import { sliceRouteFrom } from '@main/session/route-slice';
import type { MovementState } from '@main/session';
import { isZonePortalTile } from '@main/game-assets/attribute-map-handler';
import { protocolLogger, sessionLogger } from '../logging';
import { getAccountClientVersion } from './protocol-compatibility';
import type { ClientConnection } from './protocol-handler';
import { PacketThrottle } from './packet-throttle';
import {
  buildAccountLoginPacket,
  buildTokenPacket,
  buildRequestMobLoginPacket,
  buildSignalPacket,
  buildMovePacket,
  buildBasicAttackPacket,
  buildSkillCastPacket,
  resolveSkillCastWire,
  buildGenericBuffPacket,
  buildChatMessagePacket,
  buildWhisperMessagePacket,
  buildNpcClickPacket,
  buildMiniPopupClickPacket,
  buildItemDestroyPacket,
  buildItemMovePacket,
  buildUseItemPacket,
  buildUseItemArmPacket,
  buildBankGoldPacket,
  buildComposeSubmitPacket,
  buildPartyInvitePacket,
  buildPartyAcceptPacket,
  buildPartyLeavePacket,
  buildDialogClickPacket,
  buildShopBuyPacket,
  buildZonePortalPacket,
  type ItemContainerKind,
} from './packet-builders';

/** Origin a chunk's codes start from: `dest` minus the sum of the per-code deltas. */
const sumCodes = (dest: MPosition, codes: readonly DirectionCode[]): MPosition => {
  let x = dest.x;
  let y = dest.y;
  for (const c of codes) {
    x -= DIR_DELTA[c].x;
    y -= DIR_DELTA[c].y;
  }
  return { x, y };
};

export class ClientControl {
  private _clientId = 0;
  private _mobIndex = 0;
  private _selfName = '';
  private readonly throttle = new PacketThrottle();

  constructor(
    private readonly connection: ClientConnection,
    public readonly movementState: MovementState,
  ) {}

  public get clientId(): number {
    return this._clientId;
  }

  public get mobIndex(): number {
    return this._mobIndex;
  }

  private get security() {
    return this.connection.security;
  }

  public setClientId(id: number): void {
    this._clientId = id;
    sessionLogger.info(`Client ID set to ${id} (0x${id.toString(16)})`);
  }

  public setMobIndex(index: number): void {
    this._mobIndex = index;
    sessionLogger.info(`Mob index set to ${index} (0x${index.toString(16)})`);
  }

  public setSelfName(name: string): void {
    this._selfName = name;
  }

  /** Party invite (0x37f) — addressed by our own charIndex; targets `targetIndex`. */
  public partyInvite(targetIndex: number): void {
    const pos = this.movementState.getPredictedPosition(Date.now());
    this.connection.send(
      buildPartyInvitePacket(this.security, this._mobIndex, targetIndex, this._selfName, pos),
    );
  }

  /** Party accept (0x3ab) — accepts the pending invite from `inviterIndex`. */
  public partyAccept(inviterIndex: number, inviterName: string): void {
    this.connection.send(
      buildPartyAcceptPacket(this.security, this._mobIndex, inviterIndex, inviterName),
    );
  }

  /** Party leave (0x37e) — leave / dissolve my current party. */
  public partyLeave(): void {
    this.connection.send(buildPartyLeavePacket(this.security, this._mobIndex));
  }

  public login(userName: string, password: string, adapterGuid: Buffer, mac: Buffer): void {
    const packet = buildAccountLoginPacket(
      this.security,
      userName,
      password,
      getAccountClientVersion(),
      adapterGuid,
      mac,
    );
    this.connection.send(packet);
  }

  public sendToken(password: string, isChanging: number): void {
    this.connection.send(buildTokenPacket(this.security, password, isChanging));
  }

  public enterMob(charIndex: number): void {
    this.connection.send(buildRequestMobLoginPacket(this.security, charIndex, 0));
  }

  public charLogout(): void {
    this.connection.send(buildSignalPacket(this.security, OPCODE_CHAR_LOGOUT, this._clientId));
  }

  /**
   * Sends the 0x3A0 idle keepalive. Addressed by `_mobIndex` (the in-world
   * player id), NOT `_clientId` — like move/attack, this is a world-addressed
   * packet. Driven by the KeepAlive timer.
   */
  public keepAlive(): void {
    this.connection.send(buildSignalPacket(this.security, OPCODE_KEEPALIVE, this._mobIndex));
  }

  public respawn(): void {
    this.connection.send(buildSignalPacket(this.security, OPCODE_RESPAWN_EXECUTE, this._mobIndex));
  }

  /**
   * Emit the next route chunk for `source`, re-sliced from the predicted position so the
   * packet src and the direction codes share one origin (the server replays from src).
   */
  public movement(
    source: string,
    finalDst: MPosition,
    moveType: number,
    speed: number,
    exact = false,
  ): { status: MoveChunkStatus; dst: MPosition; cooldownMs: number } {
    const src = this.movementState.getPredictedPosition(Date.now());

    const arriveSlack = exact ? 0 : ARRIVE_EPSILON;
    if (chebyshev(src, finalDst) <= arriveSlack) {
      return { status: 'arrived', dst: finalDst, cooldownMs: 0 };
    }

    const route = this.movementState.getRoute(source);
    if (!route) return { status: 'no-route', dst: src, cooldownMs: 0 };

    const slice = sliceRouteFrom(route, src);
    if (!slice) return { status: 'replan', dst: src, cooldownMs: 0 };

    // The codes originate at codesOrigin (= the route tile sliceRouteFrom picked), ≤ a few tiles off
    // the predicted src due to renderer↔main IPC lag. Re-anchor the wire to codesOrigin so the packet
    // is coherent by construction (codesOrigin + codes = slice.dest); the server replays from the
    // claimed origin (≤0x22 drift tolerance). Beyond the tolerance the predicted has left the planned
    // corridor (stale route) → replan from the live tile.
    const codesOrigin = sumCodes(slice.dest, slice.codes);
    const originDrift = chebyshev(codesOrigin, src);
    if (originDrift > ORIGIN_REANCHOR_TOLERANCE) {
      return { status: 'replan', dst: src, cooldownMs: 0 };
    }
    const wireSrc = codesOrigin; // one origin for both the wire packet and the dead-reckoned leg

    // Skip a re-slice identical to the in-flight leg: re-sending snaps the observer back to src.
    if (this.movementState.isLegInFlight(wireSrc, slice.codes, Date.now())) {
      return { status: 'in-progress', dst: slice.dest, cooldownMs: speedTierFloorMs(speed) };
    }

    const packet = buildMovePacket(
      this.security,
      this._mobIndex,
      wireSrc,
      slice.dest,
      moveType,
      speed,
      slice.codes,
    );
    this.connection.send(packet);

    const steps = moveStepCount(wireSrc, slice.dest, slice.codes);
    // Leg src == wire src == codesOrigin: the broadcast matches exactly what we told the server, and
    // the explicit src means commitMove never re-reads the clock for the origin (no boundary-straddle).
    this.movementState.commitMove(slice.dest, steps, speed, slice.codes, wireSrc);

    protocolLogger.info(
      `[move-tx] 0x36C src=(${wireSrc.x},${wireSrc.y}) dst=(${slice.dest.x},${slice.dest.y}) steps=${steps} mt=${moveType} codes=${slice.codes.join(',')}`,
    );
    return { status: 'in-progress', dst: slice.dest, cooldownMs: speedTierFloorMs(speed) };
  }

  /** Straight-line move with no A* route (manual UI click-to-move). */
  public movementStraight(
    destiny: MPosition,
    moveType: number,
    speed: number,
  ): { status: MoveChunkStatus; dst: MPosition; cooldownMs: number } | null {
    const src = this.movementState.getPredictedPosition(Date.now());

    const originGap = chebyshev(src, destiny);
    if (originGap > MAX_EXECUTION_DISTANCE) {
      protocolLogger.warn(
        `[move-tx] REJECT origin-incoherent src=(${src.x},${src.y}) dst=(${destiny.x},${destiny.y}) cheb=${originGap}`,
      );
      return null;
    }

    const packet = buildMovePacket(this.security, this._mobIndex, src, destiny, moveType, speed);
    this.connection.send(packet);

    const steps = moveStepCount(src, destiny);
    // Leg src == the wire src we just sent (no clock re-read for the origin).
    this.movementState.commitMove(destiny, steps, speed, undefined, src);

    protocolLogger.info(
      `[move-tx] 0x36C (straight) src=(${src.x},${src.y}) dst=(${destiny.x},${destiny.y}) steps=${steps} mt=${moveType}`,
    );
    return { status: 'in-progress', dst: destiny, cooldownMs: speedTierFloorMs(speed) };
  }

  /**
   * Basic attack (`skillId === 0`) or skill cast (`skillId > 0`).
   *
   * Skill casts accept multi-target lists: `targetIndexes[0]` is primary;
   * further entries are secondary AoE slots. `packetKind` comes from
   * SkillData and selects opcode/size (1→0x39D/72, 2→0x39E/80, else→0x367/168).
   */
  public singleAttack(
    clientId: number,
    attackerPosition: MPosition,
    targetPosition: MPosition,
    targetIndex: number,
    skillId: number,
    opts?: { packetKind?: number; extraTargetIndexes?: readonly number[] },
  ): void {
    // remap applied at the wire).
    if (skillId === 0) {
      this.sendThrottled(
        buildBasicAttackPacket(
          this.security,
          clientId,
          attackerPosition,
          targetPosition,
          targetIndex,
        ),
        OPCODE_SINGLE_ATTACK,
      );
      return;
    }
    const packetKind = opts?.packetKind ?? 1;
    const targetIndexes = [targetIndex, ...(opts?.extraTargetIndexes ?? [])];
    const { opcode } = resolveSkillCastWire(packetKind);
    this.sendThrottled(
      buildSkillCastPacket(
        this.security,
        clientId,
        attackerPosition,
        targetPosition,
        skillId,
        targetIndexes,
        packetKind,
      ),
      opcode,
    );
  }

  /**
   * Self/no-target buff cast — the auto-buff path. Routes by `packetKind`
   * 168-byte generic 0x367. Distinct from {@link singleAttack} (always 0x39D
   * at an enemy). Throttled under the COMBAT category.
   */
  public castBuff(
    clientId: number,
    attackerPosition: MPosition,
    skillId: number,
    packetKind: number,
  ): void {
    // packetKind selects the wire opcode. A packetKind===1 buff sent as the
    // generic 0x367 is echoed by the server but never applied — it must go as
    // 0x39D self-targeted (target = caster). packetKind===2 (AoE) is rare for
    // buffs; fall back to generic.
    if (packetKind === 1) {
      this.sendThrottled(
        buildSkillCastPacket(
          this.security,
          clientId,
          attackerPosition,
          attackerPosition, // self-target — buffs have no enemy entity
          skillId,
          [clientId],
          1,
        ),
        OPCODE_SINGLE_ATTACK,
      );
      return;
    }
    this.sendThrottled(
      buildGenericBuffPacket(this.security, clientId, attackerPosition, skillId),
      OPCODE_SKILL_ATTACK,
    );
  }

  public sendMessage(clientId: number, message: string): void {
    this.sendThrottled(
      buildChatMessagePacket(this.security, clientId, message),
      OPCODE_CHAT_MESSAGE,
    );
  }

  public sendCommand(clientId: number, command: string, message: string): void {
    this.sendThrottled(
      buildWhisperMessagePacket(this.security, clientId, command, message),
      OPCODE_WHISPER_MESSAGE,
    );
  }

  /**
   * NPC click (0x28B). Returns the 1000ms cooldown matching the canonical
   * click throttle (`g_game+0x27662 + 1000 < now`). ActionQueue enforces.
   */
  public npcClick(targetMobIndex: number): { cooldownMs: number } {
    this.connection.send(buildNpcClickPacket(this.security, this._mobIndex, targetMobIndex));
    return { cooldownMs: 1000 };
  }

  /** Zone portal (0x290). Gated by AttributeMap bit 0x10; 1000ms cooldown via ActionQueue. */
  public useZonePortal(): { cooldownMs: number } {
    const now = Date.now();
    const pos = this.movementState.getPredictedPosition(now);
    if (this.movementState.isInterpolating(now)) {
      protocolLogger.warn(`[zone-portal] sending while interpolating (${pos.x},${pos.y})`);
    }
    if (!isZonePortalTile(pos.x, pos.y)) {
      protocolLogger.warn(`[zone-portal] skipped 0x290 — not on pad tile (${pos.x},${pos.y})`);
      return { cooldownMs: 0 };
    }
    this.connection.send(buildZonePortalPacket(this.security, this._mobIndex));
    return { cooldownMs: 1000 };
  }

  public miniPopupClick(buttonIndex: number): void {
    this.connection.send(buildMiniPopupClickPacket(this.security, this._mobIndex, buttonIndex));
  }

  /**
   * 0x376 item-MOVE sub-form (two-slot move). For a same-item bag→bag move onto
   * an occupied stack the server consolidates (grouping) and answers with two
   * `0x182` sub=1 slot snapshots. wire+6 = `_mobIndex` (the player id the server
   * stamps on every player-addressed packet). 1000ms cooldown; ActionQueue
   * enforces. See .
   */
  public itemMove(
    srcKind: ItemContainerKind,
    srcSlot: number,
    dstKind: ItemContainerKind,
    dstSlot: number,
    bankerId = 0,
  ): { cooldownMs: number } {
    this.connection.send(
      buildItemMovePacket(
        this.security,
        this._mobIndex,
        srcKind,
        srcSlot,
        dstKind,
        dstSlot,
        bankerId,
      ),
    );
    return { cooldownMs: 1000 };
  }

  /**
   * 0x02E4 item-destroy (game). Caller is responsible for
   * rate-limiting and pending-emit tracking. Server confirms via `0x182` sub=1
   * zeroing the slot.
   */
  public itemDestroy(slot: number, itemId: number): void {
    this.connection.send(buildItemDestroyPacket(this.security, this._mobIndex, slot, itemId));
  }

  /**
   * 0x373 Form A USE-item. Stamps the player's current predicted position
   * into the +0x1C/+0x1E coords (the USE-vs-MOVE discriminator). Caller is
   * responsible for inventory-presence validation (the wire does not carry
   * itemId; the renderer checks `inventory[slot].index === itemId` first) and
   * for the canonical per-bucket cooldown (HP 250ms / MP 300ms / mount-feed
   * 500ms / herb 300ms). Returns `cooldownMs` for ActionQueue serialization
   * of bursts (300ms default — server-side per-bucket throttle is the real
   * gate). `itemId` is forwarded only for diagnostic logging.
   */
  public useItem(
    slot: number,
    itemId: number,
    feedMarker: 0 | 0xe,
    destIndex = 0,
  ): { cooldownMs: number } {
    const playerPosition = this.movementState.getPredictedPosition(Date.now());
    this.connection.send(
      buildUseItemPacket(
        this.security,
        this._mobIndex,
        slot,
        feedMarker,
        playerPosition,
        destIndex,
      ),
    );
    protocolLogger.info(
      `[use-item-tx] 0x373 slot=${slot} id=${itemId} feedMarker=0x${feedMarker.toString(16)} ` +
        `dest=${destIndex} pos=(${playerPosition.x},${playerPosition.y})`,
    );
    return { cooldownMs: 300 };
  }

  /**
   * 0x3AE channel-arm for a hunt-scroll teleport. Re-validates the scroll id and
   * snaps `(destX, destY)` to a `PotalPos` destination SYNCHRONOUSLY (no packet on
   * a bad item/destination), then sends only the arm. The matching 0x373 (carrying
   * the resolved menu index) is flushed ~5000 ms later by the ActionQueue follow-up
   * (see ipc-command-handlers USE_TELEPORT_SCROLL), mirroring the canonical channel.
   */
  public useTeleportScroll(
    slot: number,
    itemId: number,
    destX: number,
    destY: number,
  ): { outcome: 'ok' | 'bad-item' | 'bad-dest'; menuIndex?: number } {
    if (!HUNT_SCROLL_CATALOG.has(itemId)) {
      protocolLogger.warn(`[scroll-tx] rejected: id=${itemId} is not a hunt scroll`);
      return { outcome: 'bad-item' };
    }
    const resolved = resolveHuntScrollDestination(itemId, destX, destY);
    if (!resolved) {
      protocolLogger.warn(
        `[scroll-tx] rejected: (${destX},${destY}) is not a destination of id=${itemId}`,
      );
      return { outcome: 'bad-dest' };
    }
    this.connection.send(buildUseItemArmPacket(this.security, this._mobIndex));
    protocolLogger.info(
      `[scroll-tx] 0x3AE arm slot=${slot} id=${itemId} → "${resolved.destination.name}" ` +
        `(${resolved.destination.x},${resolved.destination.y}) index=${resolved.index}`,
    );
    return { outcome: 'ok', menuIndex: resolved.index };
  }

  /**
   * 0x3AE channel-arm for a channel scroll (Pergaminho Retorno / Teleporte / Portal).
   * Re-validates the id, then sends only the arm — NO destination (the server owns
   * the fixed return/portal point; the matching 0x373 carries `+0x20 = 0`). The
   * 0x373 is flushed ~5000 ms later by the ActionQueue follow-up (see
   * ipc-command-handlers USE_RETURN_SCROLL), mirroring the canonical channel.
   * Same client path as a cooldown drink — the teleport is a pure server-side
   * consequence of the item id.
   */
  public useReturnScroll(slot: number, itemId: number): { outcome: 'ok' | 'bad-item' } {
    if (!CHANNEL_SCROLL_IDS.has(itemId)) {
      protocolLogger.warn(`[scroll-tx] rejected: id=${itemId} is not a channel scroll`);
      return { outcome: 'bad-item' };
    }
    this.connection.send(buildUseItemArmPacket(this.security, this._mobIndex));
    protocolLogger.info(`[scroll-tx] 0x3AE arm (channel) slot=${slot} id=${itemId}`);
    return { outcome: 'ok' };
  }

  /** 0x388 bank gold deposit (hand→bank). Banker proximity is the engine's responsibility. */
  public bankDepositGold(amount: number): { cooldownMs: number } {
    this.connection.send(
      buildBankGoldPacket(this.security, this._mobIndex, OPCODE_BANK_GOLD_DEPOSIT, amount),
    );
    return { cooldownMs: 1000 };
  }

  /** 0x387 bank gold withdraw (bank→hand). */
  public bankWithdrawGold(amount: number): { cooldownMs: number } {
    this.connection.send(
      buildBankGoldPacket(this.security, this._mobIndex, OPCODE_BANK_GOLD_WITHDRAW, amount),
    );
    return { cooldownMs: 1000 };
  }

  /** 0x2E7 composition submit (Item-Mix OK). Ingredients are gathered by the caller from the live bag. */
  public composeSubmit(
    recipeIndex: number,
    ingredients: readonly ComposeWireIngredient[],
  ): { cooldownMs: number } {
    this.connection.send(
      buildComposeSubmitPacket(this.security, this._mobIndex, recipeIndex, ingredients),
    );
    return { cooldownMs: 1000 };
  }

  /**
   * 0x379 shop buy — `shopSlot` is linear 0x17C index (encoded in builder);
   */
  public shopBuy(npcIndex: number, shopSlot: number, bagSlot: number): { cooldownMs: number } {
    this.connection.send(
      buildShopBuyPacket(this.security, this._mobIndex, npcIndex, shopSlot, bagSlot),
    );
    return { cooldownMs: 1000 };
  }

  /** 0x27B dialog/quest/trainer click (nibble 1) — body is NPC index only. */
  public dialogClick(targetMobIndex: number): void {
    this.connection.send(buildDialogClickPacket(this.security, this._mobIndex, targetMobIndex));
  }

  /** Sends the packet only if PacketThrottle allows it (same-category consecutive throttle). */
  private sendThrottled(buffer: Buffer, opcode: number): void {
    if (!this.throttle.shouldAllow(opcode)) return;
    this.connection.send(buffer);
  }
}
