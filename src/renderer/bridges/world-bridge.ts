import type { WydBotAPI } from '@shared/ipc/ipc-api';
import { classifyGameMessage } from '@shared/lib/game-message-parser';
import { chebyshev } from '@shared/lib/movement-math';
import { usePlayerStore } from '../stores/player-store';
import { useGameStore } from '../stores/game-store';
import { useShopStore } from '../stores/shop-store';
import { useUIStore } from '../stores/ui-store';
import { enrichItem } from '../lib/item-enrich';
import { initItemDb, getItemDb } from '../lib/item-db';
import { useAssetHealthStore } from '../stores/asset-health-store';
import { getWalkabilityService } from '../lib/walkability-service';
import { logger } from '../lib/logger';
import { MAX_EXECUTION_DISTANCE } from '../lib/macro-engine';
import { emitMacroEvent } from '../lib/macro-events';
import {
  emitMoveEcho,
  emitMoveEnqueued,
  emitMoveRejected,
  type MoveRejectedReason,
} from '../lib/move-echo-bus';
import { emitNpcInteractOutOfRange } from '../lib/npc-interact-bus';
import { emitTeleportScrollDone } from '../lib/scroll-echo-bus';
import { getServerMessage, isServerPopupSubtype } from '../lib/strdef-lookup';
import { onCharToWorldDuringReconnect } from '../lib/reconnect-controller';

export const setupWorldBridge = (api: WydBotAPI): (() => void)[] => {
  // Pre-load game data (resolves before onCharToWorld arrives). All game data
  // flows through the unified ItemDb — single init path.
  const dataReady = initItemDb();
  // Surface a degraded item/skill DB (a boot-critical asset that failed to parse)
  // as a persistent in-game banner — never a silent partial load.
  void dataReady
    .then(() => useAssetHealthStore.getState().setHealth(getItemDb().meta.degraded ?? null))
    .catch(() => {});
  // Kick off the heightmap fetch at boot so consumers don't race the load (`ready()` is idempotent).
  // The warm kick swallows failures — the CharToWorld handler re-fetches readiness and logs them.
  void getWalkabilityService()
    .ready()
    .catch(() => {});

  const unsubs: (() => void)[] = [];

  // Renderer mirror of main's movement epoch — gates stale position broadcasts.
  let currentEpoch = 0;

  // Bulk-wipe fired before CharToWorld and CharLogoutSignal.
  unsubs.push(
    api.onEntitiesReset(() => {
      logger.log('[BRIDGE] onEntitiesReset received');
      useGameStore.getState().clearEntities();
    }),
  );

  // --- Entered world (CharToWorld) ---
  unsubs.push(
    api.onCharToWorld(async (data) => {
      currentEpoch = 0; // fresh session: main's epoch restarts from 0 on setCharToWorld
      try {
        // Re-fetched per entry, never the setup-time promise: awaiting a stale
        // rejected promise here hung EVERY CharToWorld silently (dead "Entrar").
        await initItemDb();
        await getWalkabilityService().ready();
      } catch (err) {
        api.sendRendererLog({
          level: 'error',
          message: `CharToWorld blocked: boot data failed to load — ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toISOString(),
          category: 'world-bridge',
        });
        throw err;
      }
      logger.log('[BRIDGE] CharToWorld received, clientIndex:', data.clientIndex);

      const name = data.name || '';

      usePlayerStore.getState().setCharToWorld({
        name,
        guildIndex: data.guildIndex,
        charClass: data.charClass,
        gold: data.gold,
        exp: data.exp,
        clientIndex: data.clientIndex,
        mobIndex: data.mobIndex ?? 0,
        position: data.position,
        finalScore: data.finalScore,
        equip: (data.equip || []).map(enrichItem),
        inventory: (data.inventory || []).map(enrichItem),
        bagUnlock: data.bagUnlock ?? [],
        statusPoint: data.statusPoint,
        cpPoint: data.cpPoint,
        skillPoint: data.skillPoint,
        criticalRate: data.criticalRate,
        saveMana: data.saveMana,
        attackSpeed: data.attackSpeed,
        pvpDamage: data.pvpDamage,
        pvpDefense: data.pvpDefense,
        resist: data.resist,
        gameMode: data.gameMode,
        skillSlots: data.skillSlots,
        learnedSkill: data.learnedSkill,
        cp: data.cp,
        evolutionTier: data.evolutionTier ?? 0,
      });

      // Arm the freshness clock at world-enter (was a no-op until the first teleport).
      usePlayerStore.getState().markTeleport();
      useUIStore.getState().setScreen('game');
      useUIStore.getState().setLoading(false);
      onCharToWorldDuringReconnect();
    }),
  );

  // --- Bank storage + gold (delivered once in 0x10A login, before CharToWorld) ---
  unsubs.push(
    api.onLoginSuccess(async (data) => {
      await dataReady;
      usePlayerStore.getState().setStorageBulk((data.cargo || []).map(enrichItem));
      usePlayerStore.getState().setBankGold(data.cargoCoin);
    }),
  );

  // --- Bank item-move echo (0x376): apply the two-slot swap locally ---
  unsubs.push(
    api.onItemMoveEcho((data) => {
      usePlayerStore
        .getState()
        .applyItemSwap(data.srcKind, data.srcSlot, data.dstKind, data.dstSlot);
    }),
  );

  // --- Bank gold balance (0x339): absolute set ---
  unsubs.push(
    api.onBankGoldBalance((data) => {
      usePlayerStore.getState().setBankGold(data.balance);
    }),
  );

  // --- Hand gold delta (0x171/0x387/0x388/0x37A/0x1BF): unified delta ---
  unsubs.push(
    api.onHandGoldDelta((data) => {
      usePlayerStore.getState().applyGoldDelta(data.delta);
    }),
  );

  // --- Hand gold absolute set (0x3AF): sent after MobDeath ---
  unsubs.push(
    api.onHandGoldSet((data) => {
      usePlayerStore.getState().setGold(data.gold);
    }),
  );

  // --- Trade item add (0x171): gold credit or normal inventory item ---
  unsubs.push(
    api.onTradeItemAdd(async (data) => {
      await dataReady;
      const view = enrichItem(data.item);
      const db = getItemDb();
      const itemEntry = db.items.get(data.item.index);
      const isGold = itemEntry?.effectSlots.some((s) => s.idx === 0x26 && s.value === 2) ?? false;
      if (isGold) {
        const hi = itemEntry!.effectSlots.find((s) => s.idx === 0x24)?.value ?? 0;
        const lo = itemEntry!.effectSlots.find((s) => s.idx === 0x25)?.value ?? 0;
        const goldAmount = ((hi & 0xff) << 8) | (lo & 0xff);
        usePlayerStore.getState().applyGoldDelta(goldAmount);
      } else {
        usePlayerStore.getState().applyTradeItemAdd(data.slot, view);
      }
    }),
  );

  // --- Sell result (0x37A): zero sold slot. Gold update arrives async via 0x3AF. ---
  unsubs.push(
    api.onSellResult(async (data) => {
      await dataReady;
      const store = usePlayerStore.getState();
      store.clearInventorySlot(data.slot);
    }),
  );

  // --- Trade result gold (0x1BF): credit modulo 100M ---
  unsubs.push(
    api.onTradeResult((data) => {
      if (data.gold > 0) {
        usePlayerStore.getState().applyGoldDelta(data.gold % 100_000_000);
      }
    }),
  );

  // --- Shop inventory (0x17C): transient merchant panel data ---
  unsubs.push(
    api.onShopInventory((data) => {
      useShopStore.getState().setItems(data.items);
    }),
  );

  // --- Create/Delete entities (nearby NPCs, monsters, other players) ---
  unsubs.push(
    api.onCreateMob((data) => {
      useGameStore.getState().addEntity(data);
    }),
  );

  // virgin slot: 0 primes / 1 dying / 2 fade; primed or fading → any wire state evicts.
  unsubs.push(
    api.onMobDeathState((data) => {
      useGameStore.getState().applyMobDeathState(data.entityId, data.state);
    }),
  );

  // 0x16f soft despawn — ObjectManager object id, not proven == mob slot index.
  // Best-effort: removeEntity is a no-op when no entity has that index.
  unsubs.push(
    api.onDespawnByObjectId(({ objectId }) => {
      useGameStore.getState().removeEntity(objectId);
    }),
  );

  // Server pulse means the slot is live; stamp presence so post-teleport idle
  // entities reconfirm without inventing an age cull. No position write — next
  // create/move corrects coords if needed. sub==2 also clears isDead.
  unsubs.push(
    api.onMobStateDelta(({ entityId, subType }) => {
      const store = useGameStore.getState();
      store.markEntitySeen(entityId);
      if (subType === 2) store.clearEntityDeath(entityId);
    }),
  );

  // 0x36B — full state+appearance resync (morph/respawn/polymorph). Defensive
  // landing: bump freshness only; let next 0x364/0x36C re-populate fields.
  unsubs.push(
    api.onMobResync(({ entityId }) => {
      useGameStore.getState().markEntitySeen(entityId);
    }),
  );

  // --- MobDeath: centralized liveness flag (single source of truth) ---
  // Sets entity.isDead = true. Consumed by attack-physical and any future
  // module that needs to skip dead entities. Mirrors game's
  unsubs.push(
    api.onMobDeath((data) => {
      useGameStore.getState().markEntityDead(data.killed);
    }),
  );

  // --- SingleAttackInbound (0x39D/0x39E/0x367): real per-target damage. ---
  unsubs.push(
    api.onSingleAttackInbound((data) => {
      const store = useGameStore.getState();
      for (const t of data.targets) {
        const entity = store.entities.find((e) => e.index === t.targetIndex);
        if (!entity || entity.category === 'npc') continue;
        // Liveness is server-authoritative (0x338/0x165); HP only drives the bar, never death.
        store.updateEntityHp(t.targetIndex, -t.damage);
      }
    }),
  );

  // --- MobHpSync (0x336 remote / 0x181 remote): absolute HP/MP + freshness + revive. ---
  unsubs.push(
    api.onMobHpSync(({ clientId, currHp, currMp }) => {
      useGameStore.getState().setEntityHp(clientId, currHp, currMp);
    }),
  );

  // --- Move: queue-side timing prediction, emitted when IPC.MOVE is received ---
  unsubs.push(
    api.onMoveEnqueued((data) => {
      emitMoveEnqueued({ moveId: data.moveId, expectedTotalMs: data.expectedTotalMs });
    }),
  );

  // --- Move: backpressure echo (no position write — that flows from onPlayerPosition) ---
  unsubs.push(
    api.onMoveAnnounced((data) => {
      const currentPos = usePlayerStore.getState().position;
      if (chebyshev(currentPos, data.dst) > MAX_EXECUTION_DISTANCE) {
        logger.warn(
          `[STALE-WALK] Dropped MOVE_ANNOUNCED echo: dst=(${data.dst.x},${data.dst.y}) too far from current=(${currentPos.x},${currentPos.y})`,
        );
        emitMoveRejected({ moveId: data.moveId, dst: data.dst, reason: 'stale-walk' });
        return;
      }
      setTimeout(
        () => emitMoveEcho({ moveId: data.moveId, dst: data.dst, status: data.status }),
        data.cooldownMs,
      );
    }),
  );

  // --- Player position: dead-reckoned broadcast from main (single position truth) ---
  unsubs.push(
    api.onPlayerPosition((data) => {
      if (data.epoch < currentEpoch) return; // a tick from before the latest correction
      currentEpoch = data.epoch;
      usePlayerStore.getState().updatePosition({ x: data.x, y: data.y });
    }),
  );

  // --- Move: deterministic rejection from main (queue-stale / no-result) ---
  // Liveness: a dropped/failed move still resolves its renderer promise.
  unsubs.push(
    api.onMoveRejected((data) => {
      emitMoveRejected({ moveId: data.moveId, reason: data.reason as MoveRejectedReason });
    }),
  );

  // --- Teleport scroll: terminal DONE echo (resolves gameApi.useTeleportScroll) ---
  unsubs.push(
    api.onTeleportScrollDone((data) => {
      emitTeleportScrollDone({ scrollId: data.scrollId, outcome: data.outcome });
    }),
  );

  // --- Rubberband: server-forced position correction (MoveType=0 or 2) ---
  unsubs.push(
    api.onRubberband((data) => {
      logger.warn(`[RUBBERBAND] Server reposition to (${data.pos.x},${data.pos.y})`);
      currentEpoch = data.epoch;
      // Steering: main adopted the server's leg and the position broadcaster is
      // already animating it — a position write here would snap to the corrected dst.
      if (!data.steering) usePlayerStore.getState().updatePosition(data.pos);
      emitMacroEvent({ kind: 'positionReset', type: 'rubberband', pos: data.pos });
    }),
  );

  // --- Teleport: server-forced area change (NPC click, portal, skill) ---
  // User-initiated reposition — macro keeps running (next step may be in new area).
  unsubs.push(
    api.onTeleport((data) => {
      currentEpoch = data.epoch;
      usePlayerStore.getState().updatePosition(data.pos);
      // Entities from the prior area are now stale until the server re-sends them.
      usePlayerStore.getState().markTeleport();
      emitMacroEvent({ kind: 'positionReset', type: 'teleport' });
    }),
  );

  // --- GameMessage (0x101): classify text, emit semantic events ---
  unsubs.push(
    api.onGameMessage((message) => {
      if (classifyGameMessage(message) === 'npc_interact_out_of_range') {
        emitNpcInteractOutOfRange();
      }
    }),
  );

  // --- ServerMessage (0x105): coded popups; classify after strdef lookup ---
  unsubs.push(
    api.onServerMessage((data) => {
      if (!isServerPopupSubtype(data.subtype)) return;
      const message = getServerMessage(data.code);
      if (classifyGameMessage(message) === 'npc_interact_out_of_range') {
        emitNpcInteractOutOfRange();
      }
    }),
  );

  // --- Move: nearby mob position updates ---
  // moveType 0 = walk broadcast (record the leg; live tile is projected);
  // moveType ≠ 0 = remote teleport (instant reposition).
  unsubs.push(
    api.onMobMove((data) => {
      const store = useGameStore.getState();
      if (data.moveType === 0) {
        store.applyEntityMove(data.clientId, {
          src: data.lastPosition,
          dst: data.destiny,
          codes: data.codes,
          speedMove: data.speedMove,
          startMs: Date.now(),
        });
      } else {
        store.updateEntityPosition(data.clientId, data.destiny);
      }
    }),
  );

  // --- RefreshScore (stats update: equip, buff, level up, etc.) ---
  unsubs.push(
    api.onRefreshScore((data) => {
      usePlayerStore.getState().updateFromRefreshScore({
        score: data.score,
        currentHp: data.currentHp,
        currentMp: data.currentMp,
        criticalRate: data.criticalRate,
        saveMana: data.saveMana,
        attackSpeed: data.attackSpeed,
        accuracy: data.accuracy,
        evasion: data.evasion,
        penetration: data.penetration,
        absorption: data.absorption,
        critDamageBonus: data.critDamageBonus,
        critDamageReduction: data.critDamageReduction,
        pvpDamage: data.pvpDamage,
        pvpDefense: data.pvpDefense,
        affects: data.affects,
        // Wall-clock at IPC arrival; UI projects remaining duration as
        // `max(0, timeOctets*8 − (now − affectsSyncMs)/1000)`. Server-driven
        affectsSyncMs: Date.now(),
      });
    }),
  );

  // --- PlayerHpMpSync (0x181 / 0x18A local): responsive absolute HP/MP. ---
  unsubs.push(
    api.onPlayerHpMpSync((data) => {
      usePlayerStore.getState().applyHpMpSync(data);
    }),
  );

  // --- SlotDeltaUpdate (0x182): per-slot equipment / inventory / storage deltas ---
  // sub=0 slot=14 carries mount HP runtime updates (combat damage, feed, etc).
  // sub=1 = inventory, sub=2 = bank storage (cargo) — per-slot deposit/withdraw reflection.
  unsubs.push(
    api.onSlotDeltaUpdate(async (data) => {
      await dataReady;
      if (data.subType === 0) {
        const view = enrichItem(data.item);
        usePlayerStore.getState().updateEquipSlot(data.slotIndex, view);
      } else if (data.subType === 1) {
        const view = enrichItem(data.item);
        usePlayerStore.getState().updateInventorySlot(data.slotIndex, view);
      } else if (data.subType === 2) {
        const view = enrichItem(data.item);
        usePlayerStore.getState().updateStorageSlot(data.slotIndex, view);
      } else {
        logger.log(`[BRIDGE] 0x182 sub=${data.subType} slot=${data.slotIndex} (semantics TBD)`);
      }
    }),
  );

  // --- Disconnected / logout ---
  unsubs.push(
    api.onCharLogoutSignal(() => {
      logger.log('[BRIDGE] Logout signal');
      useUIStore.getState().setScreen('charlist');
    }),
  );

  return unsubs;
};
