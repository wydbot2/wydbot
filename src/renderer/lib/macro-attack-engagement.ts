import type { MPosition } from '@shared/types';
import { attackDistance, chebyshev } from '@shared/lib/movement-math';
import {
  ATTACK_POLL_INTERVAL_MS,
  DEFAULT_GIVEUP_TIMEOUT_SEC,
  GIVEUP_IGNORE_TTL_MS,
  LEASH_TILES,
} from '@shared/constants/attack';
import type { AttackMode, AttackSection } from '@shared/app-config';
import type { IpcMobDeath } from '@shared/ipc/ipc-api';
import type { AmbientModule } from './ambient-module-types';
import { useAppConfigStore } from '../stores/app-config-store';
import { useGameStore } from '../stores/game-store';
import { usePlayerStore } from '../stores/player-store';
import { isSummon } from './entity-selectors';
import { isEntityActionable, isEntityPresent } from './entity-freshness';
import { getEntityLivePosition } from './entity-position';
import { getWydAPI } from './electron-api';
import type { MacroEvent } from './macro-events';
import { emitMacroEvent, onMacroEvent } from './macro-events';
import { logMacro } from './macro-log';
import { pickAttackTileAround } from './walkability-pickers';
import { getWalkabilityService } from './walkability-service';

type ModuleState =
  | 'idle'
  | 'engaging'
  | 'awaiting-engaging'
  | 'attacking'
  | 'returning'
  | 'awaiting-returning';

export interface Target {
  index: number;
  pos: MPosition;
  name: string;
}

export interface AttackPolicy {
  /** Source name used for ambient registration and `combatStarted`/`combatEnded` keying. */
  name: string;
  /** Which `config.attack.mode` value enables this policy. Mutex with sibling policy. */
  mode: AttackMode;
  /** Effective attack range (tiles): physical = configured attackRange; magical = the
   *  rotation's max skill castRange. Drives approach + the in-range state gate. */
  getRange: () => number;
  /** Invoked each tick while target is in range. Owns cadence + cooldown + firing decision. */
  executeAttack: (target: Target, playerPos: MPosition) => void;
  /** Hook for policy-specific state teardown (cooldown maps, last-cast timestamps). */
  reset: () => void;
}

/** Server-side mob names sometimes carry trailing whitespace — match engagement + fanout. */
export const normalizeEntityName = (s: string): string => s.trim().toLowerCase();

const normalizeName = normalizeEntityName;

// routeCostOf returns null for unreachable candidates; injected to keep this pure and unit-testable.
export const nearestReachableByRoute = (
  candidates: readonly Target[],
  routeCostOf: (c: Target) => number | null,
): Target | null => {
  let best: Target | null = null;
  let bestCost = Infinity;
  for (const c of candidates) {
    const cost = routeCostOf(c);
    if (cost === null || cost >= bestCost) continue;
    bestCost = cost;
    best = c;
  }
  return best;
};

// Give-up resolution chain: per-monster override → global attack.giveUp → default.
// Name match mirrors the whitelist (trim + lowercase).
export const resolveGiveUpTimeoutSec = (
  attack: AttackSection | undefined,
  targetName: string,
): number => {
  const needle = normalizeName(targetName);
  const monster = attack?.monsters?.find((m) => normalizeName(m.name) === needle);
  return monster?.giveUpTimeoutSec ?? attack?.giveUp?.timeoutSec ?? DEFAULT_GIVEUP_TIMEOUT_SEC;
};

export const createAttackEngagement = (policy: AttackPolicy): AmbientModule => {
  let state: ModuleState = 'idle';
  let anchor: MPosition | null = null;
  let target: Target | null = null;
  let engageStartedAt = 0;

  const recentlyAbandoned = new Map<number, number>();

  let lastShouldRun: boolean | null = null;
  let lastIdleHeartbeatAt = 0;
  const IDLE_HEARTBEAT_MS = 10_000;

  let anchorRecentered = false;

  let unsubMobDeath: (() => void) | null = null;
  let unsubRubberband: (() => void) | null = null;
  let unsubTeleport: (() => void) | null = null;
  let unsubMacroEvents: (() => void) | null = null;

  const transitionTo = (next: ModuleState, reason?: string): void => {
    if (state === next) return;
    const prev = state;
    state = next;
    const suffix = reason ? `: ${reason}` : '';
    logMacro('info', `[${policy.name}] ${prev} → ${next}${suffix}`);
    // Boundary-only emit: idle ↔ non-idle. Intermediate transitions keep the source active.
    if (prev === 'idle') emitMacroEvent({ kind: 'combatStarted', source: policy.name });
    else if (next === 'idle') emitMacroEvent({ kind: 'combatEnded', source: policy.name });

    if (next === 'engaging' || next === 'attacking' || next === 'returning') {
      emitMacroEvent({
        kind: 'attackPhaseChanged',
        phase: next,
        targetName: target?.name ?? null,
      });
    }
  };

  const setTarget = (next: Target | null): void => {
    target = next;
    anchorRecentered = false;
    emitMacroEvent({ kind: 'targetChanged', name: next?.name ?? null });
  };

  const clearEngagement = (): void => {
    setTarget(null);
    engageStartedAt = 0;
  };

  const hasWalkSteps = (): boolean =>
    (useAppConfigStore.getState().config.steps ?? []).some((s) => s.kind === 'walk');

  // Route macro: the walker owns repositioning, so release at the current spot; stand-and-farm walks back to the anchor.
  const disengage = (reason: string): void => {
    if (hasWalkSteps()) {
      anchor = null;
      transitionTo('idle', reason);
    } else {
      transitionTo('returning', reason);
    }
  };

  /** Ghost-mob canary — logs a snapshot at give-up so the log can confirm ghost
   * vs real (hp=0/stale/missing ⇒ ghost). */
  const logGiveUpSnapshot = (reason: string): void => {
    const t = target;
    if (!t) return;
    const now = Date.now();
    const e = useGameStore.getState().entities.find((x) => x.index === t.index);
    if (!e) {
      logMacro(
        'warn',
        `[giveup] ${reason}: "${t.name}" idx=${t.index} — alvo ausente do store (evaporou durante o engagement)`,
      );
      return;
    }
    const pos = getEntityLivePosition(e, now);
    const playerPos = usePlayerStore.getState().position;
    const hp = e.category === 'npc' ? 'n/a' : `${e.score.currHp}/${e.score.maxHp}`;
    logMacro(
      'warn',
      `[giveup] ${reason}: "${e.name}" idx=${e.index} pos=(${pos.x},${pos.y}) dist=${chebyshev(playerPos, pos)} hp=${hp} isDead=${e.isDead === true} deathState=${e.deathState ?? 'null'} lastSeenAge=${now - (e.lastSeenMs ?? 0)}ms engagedFor=${now - engageStartedAt}ms`,
    );
  };

  /** Ban the current target for GIVEUP_IGNORE_TTL_MS and return — the scan picks the next mob. */
  const abandonAsUnreachable = (): void => {
    if (!target) return;
    logGiveUpSnapshot('approach-failed');
    recentlyAbandoned.set(target.index, Date.now() + GIVEUP_IGNORE_TTL_MS);
    emitMacroEvent({ kind: 'attackGaveUp', reason: 'approach-failed', targetName: target.name });
    clearEngagement();
    disengage('Alvo inalcançável — desistindo');
  };

  const pruneRecentlyAbandoned = (now: number): void => {
    for (const [idx, expiry] of recentlyAbandoned) {
      if (expiry <= now) recentlyAbandoned.delete(idx);
    }
  };

  const findHostileMonster = (
    index: number,
  ): { pos: MPosition; name: string; alive: boolean } | null => {
    const entity = useGameStore.getState().entities.find((e) => e.index === index);
    if (!entity || entity.category !== 'monster' || isSummon(entity)) return null;
    // isEntityPresent catches unsignaled deaths (currHp=0 / prime) mid-engagement
    // that the bare isDead flag misses.
    const alive = isEntityPresent(entity, usePlayerStore.getState().lastTeleportMs);
    return { pos: getEntityLivePosition(entity), name: entity.name, alive };
  };

  const findHostileInRadius = (
    playerPos: MPosition,
    whitelist: ReadonlyArray<string>,
    radius: number,
  ): Target | null => {
    if (whitelist.length === 0) return null;
    // Trim both sides — WYD2 server emits trailing whitespace on some mob names.
    const whitelistLower = new Set(whitelist.map(normalizeName));
    const entities = useGameStore.getState().entities;
    const lastTeleportMs = usePlayerStore.getState().lastTeleportMs;

    const candidates = entities
      .filter(
        (e) =>
          e.category === 'monster' &&
          !isSummon(e) &&
          isEntityActionable(e, { lastTeleportMs, playerPos, horizon: radius }) &&
          whitelistLower.has(normalizeName(e.name)) &&
          !recentlyAbandoned.has(e.index),
      )
      .map((e) => ({ index: e.index, pos: getEntityLivePosition(e), name: e.name }));

    const svc = getWalkabilityService();
    return nearestReachableByRoute(candidates, (c) => {
      const route = svc.searchRoute(playerPos.x, playerPos.y, c.pos.x, c.pos.y);
      return route.status === 'complete' ? route.tiles.length - 1 : null;
    });
  };

  const onTargetDead = (reason: string): void => {
    if (state === 'idle' || state === 'returning') return;
    const killedName = target?.name ?? '?';
    clearEngagement();
    const attack = useAppConfigStore.getState().config.attack;
    const whitelist = (attack?.monsters ?? []).map((m) => m.name);
    const detectionRadius = attack?.targeting?.detectionRadius ?? 6;
    const playerPos = usePlayerStore.getState().position;
    const next = findHostileInRadius(playerPos, whitelist, detectionRadius);
    if (next) {
      setTarget(next);
      engageStartedAt = Date.now();
      transitionTo('engaging', `${reason}: ${killedName} → próximo: ${next.name}`);
      return;
    }
    disengage(`${reason}: ${killedName} — radius limpo, retornando`);
  };

  const onMobDeath = (data: IpcMobDeath): void => {
    if (!target || data.killed !== target.index) return;
    onTargetDead('Alvo abatido (server)');
  };

  /**
   * Let the state machine adapt on next tick via the universal leash check.
   */
  const onRubberband = (): void => {
    // Intentionally empty.
  };

  /**
   * everything so the next idle scan starts fresh in the new area.
   */
  const onTeleport = (): void => {
    if (state === 'idle') return;
    anchor = null;
    clearEngagement();
    transitionTo('idle', 'Teleport — desengajando');
  };

  const handleMacroEvent = (event: MacroEvent): void => {
    switch (event.kind) {
      case 'positionReset':
        // Recenter the leash once per target on a rubberband; teleport disengages via onTeleport.
        if (event.type === 'rubberband' && anchor !== null && !anchorRecentered) {
          anchor = usePlayerStore.getState().position;
          anchorRecentered = true;
        }
        break;
      case 'moveCompleted':
        if (event.source !== policy.name) break;
        if (state === 'awaiting-engaging') state = 'engaging';
        else if (state === 'awaiting-returning') state = 'returning';
        break;
      case 'moveRejected':
        if (event.source !== policy.name) break;
        if (state === 'awaiting-engaging') {
          // 'aborted' = interruption (rubberband/teleport/preempt): re-evaluate next tick, don't ban.
          if (event.reason === 'aborted') {
            logMacro('info', `[${policy.name}] approach aborted (${event.reason}) — re-evaluating`);
            state = 'engaging';
          } else {
            abandonAsUnreachable();
          }
        } else if (state === 'awaiting-returning') {
          state = 'returning';
        }
        break;
      default:
        break;
    }
  };

  const mountListeners = (): void => {
    const api = getWydAPI();
    if (!api) return;
    if (unsubMobDeath === null) unsubMobDeath = api.onMobDeath(onMobDeath);
    if (unsubRubberband === null) unsubRubberband = api.onRubberband(onRubberband);
    if (unsubTeleport === null) unsubTeleport = api.onTeleport(onTeleport);
    if (unsubMacroEvents === null) unsubMacroEvents = onMacroEvent(handleMacroEvent);
  };

  const unmountListeners = (): void => {
    unsubMobDeath?.();
    unsubRubberband?.();
    unsubTeleport?.();
    unsubMacroEvents?.();
    unsubMobDeath = null;
    unsubRubberband = null;
    unsubTeleport = null;
    unsubMacroEvents = null;
  };

  return {
    name: policy.name,
    pollIntervalMs: ATTACK_POLL_INTERVAL_MS,
    lifecycle: 'macro-coupled',

    tick: async (signal) => {
      if (signal.aborted) return;
      mountListeners();
      pruneRecentlyAbandoned(Date.now());

      const attack = useAppConfigStore.getState().config.attack;
      const mode = attack?.mode ?? 'physical';
      const shouldRun =
        attack?.enabled === true && mode === policy.mode && (attack.monsters?.length ?? 0) > 0;

      if (shouldRun !== lastShouldRun) {
        lastShouldRun = shouldRun;
        const monsterList = (attack?.monsters ?? []).map((m) => m.name).join(', ');
        if (shouldRun) {
          logMacro('info', `[${policy.name}] ativo — whitelist=[${monsterList}]`);
        } else {
          logMacro(
            'info',
            `[${policy.name}] inativo (enabled=${String(attack?.enabled)}, mode=${mode}, monsters=${attack?.monsters?.length ?? 0})`,
          );
        }
      }

      if (!shouldRun) {
        if (state !== 'idle') {
          anchor = null;
          clearEngagement();
          transitionTo('idle');
        }
        return;
      }

      const whitelist = (attack.monsters ?? []).map((m) => m.name);
      const detectionRadius = attack.targeting?.detectionRadius ?? 6;
      const range = policy.getRange();

      const playerPos = usePlayerStore.getState().position;

      if (state !== 'idle' && anchor) {
        if (chebyshev(playerPos, anchor) > LEASH_TILES) {
          if (state === 'returning') {
            clearEngagement();
            anchor = null;
            transitionTo('idle', 'Anchor inalcançável — abandonando');
          } else {
            if (target) {
              emitMacroEvent({
                kind: 'attackGaveUp',
                reason: 'leash-broken',
                targetName: target.name,
              });
            }
            clearEngagement();
            disengage('Alvo escapou do raio — retornando');
          }
          return;
        }
        if (engageStartedAt > 0 && target) {
          const giveUpTimeoutMs = resolveGiveUpTimeoutSec(attack, target.name) * 1000;
          if (Date.now() - engageStartedAt > giveUpTimeoutMs) {
            logGiveUpSnapshot('persisted-alive');
            recentlyAbandoned.set(target.index, Date.now() + GIVEUP_IGNORE_TTL_MS);
            emitMacroEvent({
              kind: 'attackGaveUp',
              reason: 'persisted-alive',
              targetName: target.name,
            });
            clearEngagement();
            disengage('Alvo persistiu vivo — desistindo');
            return;
          }
        }
      }

      switch (state) {
        case 'idle': {
          const hostile = findHostileInRadius(playerPos, whitelist, detectionRadius);
          if (!hostile && Date.now() - lastIdleHeartbeatAt > IDLE_HEARTBEAT_MS) {
            lastIdleHeartbeatAt = Date.now();
            const all = useGameStore.getState().entities;
            const freshT = usePlayerStore.getState().lastTeleportMs;
            const monsters = all.filter(
              (e) =>
                e.category === 'monster' &&
                !isSummon(e) &&
                isEntityActionable(e, {
                  lastTeleportMs: freshT,
                  playerPos,
                  horizon: detectionRadius,
                }),
            );
            const lower = new Set(whitelist.map((n) => n.trim().toLowerCase()));
            const inWhitelist = monsters.filter((m) => lower.has(m.name.toLowerCase()));
            logMacro(
              'info',
              `[${policy.name}] idle: ${all.length} entidades, ${monsters.length} monstros, ${inWhitelist.length} match whitelist (radius=${detectionRadius})`,
            );
          }
          if (hostile) {
            anchor = playerPos;
            setTarget(hostile);
            engageStartedAt = Date.now();
            transitionTo(
              'engaging',
              `Engajando alvo: ${hostile.name} idx=${hostile.index} pos=(${hostile.pos.x},${hostile.pos.y})`,
            );
          }
          return;
        }

        case 'engaging': {
          if (!target) {
            transitionTo('idle');
            return;
          }
          const live = findHostileMonster(target.index);
          if (!live || !live.alive) {
            onTargetDead('Alvo abatido durante aproximação');
            return;
          }
          target = { index: target.index, pos: live.pos, name: live.name };

          const dist = attackDistance(playerPos, target.pos);
          const losOk =
            dist <= 1 ||
            getWalkabilityService().hasLineOfWalk(
              playerPos.x,
              playerPos.y,
              target.pos.x,
              target.pos.y,
            );
          if (dist <= range && losOk) {
            transitionTo('attacking');
            return;
          }

          const approach = pickAttackTileAround(target.pos, range, playerPos);
          if (!approach) {
            abandonAsUnreachable();
            return;
          }
          emitMacroEvent({ kind: 'requestMove', dest: approach, source: policy.name });
          state = 'awaiting-engaging';
          return;
        }

        case 'awaiting-engaging':
        case 'awaiting-returning':
          return;

        case 'attacking': {
          if (!target) {
            transitionTo('idle');
            return;
          }
          const live = findHostileMonster(target.index);
          if (!live || !live.alive) {
            onTargetDead('Alvo abatido');
            return;
          }
          target = { index: target.index, pos: live.pos, name: live.name };

          const dist = attackDistance(playerPos, target.pos);
          // +1 hysteresis: a mob orbiting the range would otherwise flap state every tick.
          // Firing is gated per-skill by castRange inside the policy, so a +1 tick simply
          // casts nothing (no wasted out-of-range 0x39D).
          if (dist > range + 1) {
            transitionTo('engaging');
            return;
          }

          // Canonical attack LOS skips dist<=1 — adjacent is never line-blocked.
          if (
            dist > 1 &&
            !getWalkabilityService().hasLineOfWalk(
              playerPos.x,
              playerPos.y,
              target.pos.x,
              target.pos.y,
            )
          ) {
            transitionTo('engaging', 'LoS perdido — reaproximando');
            return;
          }

          policy.executeAttack(target, playerPos);
          return;
        }

        case 'returning': {
          if (!anchor) {
            transitionTo('idle');
            return;
          }
          if (chebyshev(playerPos, anchor) <= 1) {
            anchor = null;
            transitionTo('idle');
            return;
          }
          const route = getWalkabilityService().searchRoute(
            playerPos.x,
            playerPos.y,
            anchor.x,
            anchor.y,
          );
          if (route.status !== 'complete') {
            anchor = null;
            transitionTo('idle', 'Âncora inalcançável — abandonando retorno');
            return;
          }
          emitMacroEvent({ kind: 'requestMove', dest: anchor, source: policy.name });
          state = 'awaiting-returning';
          return;
        }
      }
    },

    reset: () => {
      // reset() bypasses transitionTo (silent admin teardown — HMR, pause, disable),
      // so emit combatEnded manually when leaving an active state.
      const wasInCombat = state !== 'idle';
      state = 'idle';
      anchor = null;
      clearEngagement();
      recentlyAbandoned.clear();
      lastShouldRun = null;
      lastIdleHeartbeatAt = 0;
      unmountListeners();
      policy.reset();
      if (wasInCombat) emitMacroEvent({ kind: 'combatEnded', source: policy.name });
    },
  };
};
