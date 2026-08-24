import { toast } from 'sonner';
import { chebyshev } from '@shared/lib/movement-math';
import { COMBAT_RECHECK_MS } from '@shared/constants/attack';
import { ARRIVE_EPSILON, MAX_EXECUTION_DISTANCE } from '@shared/constants/movement';
import type { MPosition } from '@shared/types';
import type { StreamRoute } from '@shared/ipc/walkability';
import type { AmbientModule } from './ambient-module-types';
import type { ActionHandler, StepContext } from './macro-engine-types';
import { executeDelay } from './macro-delay';
import { executeInteract } from './macro-npc-interact';
import { executeFollow } from './macro-follow';
import { executeMarker } from './macro-marker';
import { executePortal } from './macro-portal';
import { executeScript } from './macro-script';
import { gameApi } from './game-api';
import { getWalkabilityService } from './walkability-service';
import { abortableDelay, isAbortError } from './macro-timing';
import { executeWalk } from './macro-walk';
import { MacroStatus } from '../stores/macro-status';
import type { MacroStepKind } from '../stores/macro-types';
import { getStepAnchor } from '../stores/macro-labels';
import { useMacroLifecycleStore } from '../stores/macro-lifecycle-store';
import { useMacroNavigationStore } from '../stores/macro-navigation-store';
import type { MoveRejectionReason } from './macro-events';
import { emitMacroEvent, onMacroEvent, WALKER_SOURCE } from './macro-events';
import { MoveRejectedError, isRecoverableMoveReason } from './move-echo-bus';
import {
  addAvoidTiles,
  clearAvoidTiles,
  computeAvoidPrefix,
  consumeAvoidSet,
  getWalkRecoverySnapshot,
  noteWalkerSuccess,
  recordRejection,
  resetWalkRecovery,
  RECOVERY_WINDOW_MS,
} from './walk-recovery';
import { useAppConfigStore } from '../stores/app-config-store';
import { usePlayerStore } from '../stores/player-store';

import { logMacro } from './macro-log';

export { logMacro } from './macro-log';

/**
 * Macro engine — client-side prediction with RE-verified timing.
 *
 * Dispatches each step to the appropriate action handler and manages lifecycle
 * (start/pause/resume/stop). The step cursor is driven ONLY by the sequence
 * (+1 modulo), a script's `goToMarker`, or a failure skip — teleports and
 * rubberbands never re-anchor it (see the `positionReset` handler).
 */

export { MAX_EXECUTION_DISTANCE };
const SKIP_DELAY_MS = 500;
/** Prefix length blacklisted after a rubberband so A* does not replay the disputed corridor. */
const RUBBERBAND_AVOID_PREFIX_TILES = 3;

const STEP_HANDLERS: Record<MacroStepKind, ActionHandler> = {
  walk: executeWalk,
  interact: executeInteract,
  follow: executeFollow,
  delay: executeDelay,
  script: executeScript,
  marker: executeMarker,
  portal: executePortal,
};

/* ── Module state ────────────────────────────────────── */

let tickTimer: ReturnType<typeof setTimeout> | null = null;
let abortController: AbortController | null = null;
let consecutiveSkips = 0;
/** Heartbeat for the combat-suspend gate so a prolonged FSM combat freeze is visible (observability only). */
let combatSuspendSince = 0;
let combatSuspendLoggedAt = 0;
const COMBAT_SUSPEND_HEARTBEAT_MS = 15_000;

/* ── Ambient module runtime ──────────────────────────── */

interface AmbientRuntime {
  module: AmbientModule;
  /** null = not currently scheduled. */
  timer: ReturnType<typeof setInterval> | null;
  /** null = not currently scheduled. Per-module so pausing one doesn't abort others. */
  abortController: AbortController | null;
}

const ambientRuntimes = new Map<string, AmbientRuntime>();

/** Modules suspended by a user script; `startAmbientModule` skips them until resumed or `stopMacro()`. */
const scriptSuspendedModules = new Set<string>();

/** Dedupes by name; on replace, tears down old runtime + restarts if it was running (HMR-safe). */
export const registerAmbientModule = (module: AmbientModule): void => {
  const existing = ambientRuntimes.get(module.name);
  const wasRunning = existing != null && existing.timer !== null;
  if (existing) {
    if (existing.timer !== null) clearInterval(existing.timer);
    existing.abortController?.abort();
    existing.module.reset();
  }
  ambientRuntimes.set(module.name, {
    module,
    timer: null,
    abortController: null,
  });
  if (wasRunning) startAmbientModule(module.name);
};

/** Idempotent. Fires `tick` once immediately, then on `pollIntervalMs`. */
export const startAmbientModule = (name: string): void => {
  const runtime = ambientRuntimes.get(name);
  if (!runtime || runtime.timer !== null) return;
  if (scriptSuspendedModules.has(name)) return;
  if (
    runtime.module.lifecycle === 'macro-coupled' &&
    useMacroLifecycleStore.getState().status !== MacroStatus.Running
  )
    return;

  const ac = new AbortController();
  runtime.abortController = ac;

  const runTick = async (): Promise<void> => {
    if (ac.signal.aborted) return;
    try {
      await runtime.module.tick(ac.signal);
    } catch (err) {
      if (isAbortError(err)) return;
      logMacro(
        'warn',
        `[${runtime.module.name}] ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  void runTick();
  runtime.timer = setInterval(runTick, runtime.module.pollIntervalMs);
};

/** `resetState=false` preserves module state (pause); `true` calls `module.reset()` (stop/disable). */
export const stopAmbientModule = (name: string, resetState = true): void => {
  const runtime = ambientRuntimes.get(name);
  if (!runtime) return;
  if (runtime.timer !== null) {
    clearInterval(runtime.timer);
    runtime.timer = null;
  }
  runtime.abortController?.abort();
  runtime.abortController = null;
  if (resetState) runtime.module.reset();
};

const startCoupledAmbientModules = (): void => {
  for (const [name, runtime] of ambientRuntimes) {
    if (runtime.module.lifecycle === 'macro-coupled') startAmbientModule(name);
  }
};

const stopCoupledAmbientModules = (resetState: boolean): void => {
  for (const [name, runtime] of ambientRuntimes) {
    if (runtime.module.lifecycle === 'macro-coupled') stopAmbientModule(name, resetState);
  }
};

export const stopAllAmbientModules = (resetState = true): void => {
  for (const name of ambientRuntimes.keys()) {
    stopAmbientModule(name, resetState);
  }
};

/** Script-driven suspend: stops without reset and blocks restarts until `resumeSuspendedModule`/`stopMacro`. */
export const suspendAmbientModule = (name: string): void => {
  scriptSuspendedModules.add(name);
  stopAmbientModule(name, false);
};

/** Undo `suspendAmbientModule` and start the module again (idempotent). */
export const resumeSuspendedModule = (name: string): void => {
  scriptSuspendedModules.delete(name);
  startAmbientModule(name);
};

export const isAmbientModuleRunning = (name: string): boolean =>
  ambientRuntimes.get(name)?.timer != null;

export const isSuspendedModule = (name: string): boolean => scriptSuspendedModules.has(name);

/**
 * Set of ambient module names currently reporting active combat. Updated by
 * the `combatStarted` / `combatEnded` event subscriber below; any non-empty
 * Set suspends sequential step dispatch.
 */
const combatSources = new Set<string>();

/**
 * In-flight move requests. Ambient modules + the walker emit `requestMove`; the
 * engine dispatches `gameApi.move` here. Same-source dedup is replace-and-defer
 * (chase target). Across sources the body is a single mover: a non-walker
 * (combat) request preempts an in-flight walk so two intents never drive the
 * 0x36C stream at once. The walker never preempts combat — it is already
 * suspended while any combat source is active.
 */
interface InFlightMove {
  dest: MPosition;
  abortController: AbortController;
  exact: boolean;
  /** Tiles of the last planned route (set by `replanFrom`); empty before the first plan. */
  routeTiles: readonly MPosition[];
}

const pendingMoves = new Map<string, InFlightMove>();

const sameTile = (a: MPosition, b: MPosition): boolean => a.x === b.x && a.y === b.y;

/** No-progress budget (ms) toward the target before treating the leg as stalled. */
const STALL_MS = 2000;
/** Floor between retries after a transient chunk failure / re-plan (avoids a tight loop). */
const CHUNK_RETRY_MS = 250;
/** Consecutive transient chunk failures before the stream gives up (the macro then recovers). */
const MAX_CHUNK_RETRIES = 3;

/**
 * null only when the STATIC map cannot route to `target` — the avoid set is a
 * path-shaping hint (contour disputed corridors), never a reachability verdict:
 * a route sealed purely by avoided tiles falls back to an avoid-free plan, and
 * a genuine dispute resurfaces as a recoverable stale-walk, not a step skip.
 */
const planStreamRoute = (target: MPosition): StreamRoute | null => {
  const cur = usePlayerStore.getState().position;
  const svc = getWalkabilityService();
  const avoided = svc.searchRoute(cur.x, cur.y, target.x, target.y, { avoid: consumeAvoidSet() });
  const r =
    avoided.status === 'complete' ? avoided : svc.searchRoute(cur.x, cur.y, target.x, target.y);
  if (r.status !== 'complete' || r.tiles.length < 2) return null;
  // Server only follows straight line-of-walk hops, not full A* contours.
  const waypoints = svc.stringPullRoute(r.tiles);
  return { tiles: r.tiles, codes: r.codes, waypoints };
};

const blacklistRoutePrefix = (target: MPosition): void => {
  const cur = usePlayerStore.getState().position;
  const r = getWalkabilityService().searchRoute(cur.x, cur.y, target.x, target.y);
  const prefix = computeAvoidPrefix(r.tiles, RUBBERBAND_AVOID_PREFIX_TILES);
  if (prefix.length > 0) addAvoidTiles(prefix);
};

/** Streams move chunks at the speed-tier cadence (paced by the `gameApi.move` echo); the main
 *  re-slices each chunk from the live predicted position. */
const dispatchMoveSequence = async (
  source: string,
  finalDest: MPosition,
  exact = false,
): Promise<void> => {
  const ac = new AbortController();
  pendingMoves.set(source, { dest: finalDest, abortController: ac, exact, routeTiles: [] });

  try {
    const speed = usePlayerStore.getState().movementSpeed || 1;
    let target = finalDest;
    let requireExact = exact;
    let lastPos: MPosition | null = null;
    let lastMovedAt = Date.now();
    let chunkRetries = 0;

    // Re-plan and push the route to main; reset the movement tracker so the stall timer can't
    // false-trip right after a re-plan.
    const replanFrom = (): void => {
      const r = planStreamRoute(target);
      if (!r) throw new MoveRejectedError({ dst: target, reason: 'unreachable' });
      gameApi.setMoveRoute(source, r);
      const inflight = pendingMoves.get(source);
      if (inflight) inflight.routeTiles = r.tiles;
      lastPos = null;
      lastMovedAt = Date.now();
    };

    replanFrom();

    for (;;) {
      if (ac.signal.aborted) throw new DOMException('Move aborted', 'AbortError');

      // Chase: a newer dest for this source replaces the target → re-plan.
      const live = pendingMoves.get(source);
      if (live && (!sameTile(live.dest, target) || live.exact !== requireExact)) {
        target = live.dest;
        requireExact = live.exact;
        replanFrom();
        continue;
      }

      const cur = usePlayerStore.getState().position;
      const arriveSlack = requireExact ? 0 : ARRIVE_EPSILON;
      if (chebyshev(cur, target) <= arriveSlack) break;

      // Stall guard keyed on raw movement, not progress-toward-target: a contour legitimately
      // detours away from the target, so a proximity metric would false-stall mid-contour.
      if (lastPos === null || !sameTile(cur, lastPos)) {
        lastPos = cur;
        lastMovedAt = Date.now();
      } else if (Date.now() - lastMovedAt > STALL_MS) {
        throw new MoveRejectedError({ dst: target, reason: 'stale-walk' });
      }

      try {
        const status = await gameApi.move(target, speed, ac.signal, source, {
          exact: requireExact,
        });
        if (status === 'arrived') break;
        if (status === 'replan' || status === 'no-route') {
          replanFrom();
          await abortableDelay(CHUNK_RETRY_MS, ac.signal); // floor against a tight re-plan loop
          continue;
        }
        chunkRetries = 0; // in-progress
      } catch (err) {
        if (isAbortError(err)) throw err;
        if (!(err instanceof MoveRejectedError) || !isRecoverableMoveReason(err.payload.reason)) {
          throw err; // unreachable / unknown → fatal
        }
        chunkRetries += 1;
        if (chunkRetries > MAX_CHUNK_RETRIES) throw err; // sustained stall → let the macro recover
        await abortableDelay(CHUNK_RETRY_MS, ac.signal);
      }
    }

    pendingMoves.delete(source);
    emitMacroEvent({ kind: 'moveCompleted', source, dest: target });
  } catch (err) {
    pendingMoves.delete(source);
    let reason: MoveRejectionReason;
    let detail: string | undefined;
    if (err instanceof MoveRejectedError) {
      reason = err.payload.reason;
    } else if (isAbortError(err)) {
      reason = 'aborted';
    } else {
      reason = 'unknown';
      detail = err instanceof Error ? err.message : String(err);
    }
    emitMacroEvent({ kind: 'moveRejected', source, reason, detail });
  }
};

/** Abort all in-flight ambient moves on pause/stop. The dispatchMoveSequence
 *  catch handles emission of moveRejected with reason='aborted'. */
const cancelAllPending = (): void => {
  for (const inflight of pendingMoves.values()) {
    inflight.abortController.abort();
  }
};

/**
 * Kind of the step under the cursor — gates skip-vs-pause on movement failures:
 * only `walk` steps may skip (the route re-plans from the next walk); a skipped
 * portal/interact/follow strands every later anchor, so those pause for the user.
 */
const currentStepKind = (): MacroStepKind | undefined => {
  const steps = useAppConfigStore.getState().config.steps ?? [];
  return steps[useMacroNavigationStore.getState().currentStepIndex]?.kind;
};

onMacroEvent((event) => {
  switch (event.kind) {
    case 'combatStarted':
      combatSources.add(event.source);
      // Hand the body to combat: abort any in-flight sequential walk leg.
      pendingMoves.get(WALKER_SOURCE)?.abortController.abort();
      break;
    case 'combatEnded':
      combatSources.delete(event.source);
      break;
    case 'requestMove': {
      const existing = pendingMoves.get(event.source);
      if (existing) {
        // Replace-and-defer: in-flight runs to completion; coroutine re-issues on resolve.
        existing.dest = event.dest;
        existing.exact = event.exact === true;
        return;
      }
      // Single mover: a combat (non-walker) request preempts an in-flight walk.
      if (event.source !== WALKER_SOURCE) {
        pendingMoves.get(WALKER_SOURCE)?.abortController.abort();
      }
      void dispatchMoveSequence(event.source, event.dest, event.exact === true);
      break;
    }
    case 'positionReset': {
      // Read dest + planned route before cancelAllPending clears pendingMoves.
      const walkerMove = pendingMoves.get(WALKER_SOURCE) ?? null;
      const walkerDest = walkerMove?.dest ?? null;
      const walkerRoute = walkerMove?.routeTiles ?? [];
      cancelAllPending();
      // Blacklist only a genuine dispute: the correction landing ON the planned
      // route is a fast-forward along our own corridor — nothing to contour.
      if (event.type === 'rubberband' && walkerDest) {
        // Prefer the wire position: on a steering correction the store is still stale.
        const corrected = event.pos ?? usePlayerStore.getState().position;
        const onCorridor = walkerRoute.some((t) => sameTile(t, corrected));
        if (!onCorridor) blacklistRoutePrefix(walkerDest);
      }
      // Teleports never move the step cursor: the flow is the config sequence
      // (or the script's goToMarker), and unreachable steps self-skip on
      // `unreachable` (see skipCurrentStep).
      break;
    }
    case 'moveCompleted':
      if (event.source === WALKER_SOURCE) noteWalkerSuccess();
      break;
    case 'walkStarted':
    case 'walkResolved':
    case 'walkAborted':
    case 'moveRejected':
    case 'targetChanged':
    case 'attackPhaseChanged':
    case 'attackGaveUp':
    case 'skillCastFired':
      break;
    default:
      event satisfies never;
  }
});

const isAnyAmbientModuleInCombat = (): boolean => combatSources.size > 0;

/**
 * Skip the current step (out of reach or no route) and advance after a delay;
 * pause when a full lap has been skipped without executing anything. `expected`
 * is the controller live when the skip was decided — the scheduled advance is
 * dropped if it was replaced or aborted meanwhile.
 */
const skipCurrentStep = (reason: string, expected: AbortController | null): void => {
  const steps = useAppConfigStore.getState().config.steps ?? [];
  const stepNumber = useMacroNavigationStore.getState().currentStepIndex + 1;
  consecutiveSkips += 1;
  logMacro('warn', `Passo #${stepNumber} pulado (${reason})`);
  toast.warning(`Passo #${stepNumber} pulado`);
  if (consecutiveSkips >= steps.length) {
    pauseMacro('Nenhum passo alcançável');
    return;
  }
  tickTimer = setTimeout(() => {
    if (!abortController || abortController !== expected || abortController.signal.aborted) return;
    if (useMacroLifecycleStore.getState().status !== MacroStatus.Running) return;
    const liveIdx = useMacroNavigationStore.getState().currentStepIndex;
    useMacroNavigationStore.getState().setCurrentIndex((liveIdx + 1) % steps.length);
    void tick();
  }, SKIP_DELAY_MS);
};

/* ── Core tick ───────────────────────────────────────── */

const tick = async (): Promise<void> => {
  try {
    const { status } = useMacroLifecycleStore.getState();
    const { currentStepIndex, setCurrentIndex } = useMacroNavigationStore.getState();
    const steps = useAppConfigStore.getState().config.steps ?? [];

    if (status !== MacroStatus.Running || steps.length < 1) {
      if (status !== MacroStatus.Paused) stopMacro();
      return;
    }

    if (isAnyAmbientModuleInCombat()) {
      const nowMs = Date.now();
      if (combatSuspendSince === 0) combatSuspendSince = nowMs;
      if (nowMs - combatSuspendLoggedAt >= COMBAT_SUSPEND_HEARTBEAT_MS) {
        combatSuspendLoggedAt = nowMs;
        logMacro(
          'warn',
          `[combat-gate] walker suspenso há ${Math.round((nowMs - combatSuspendSince) / 1000)}s (FSM em combate)`,
        );
      }
      tickTimer = setTimeout(() => void tick(), COMBAT_RECHECK_MS);
      return;
    }
    combatSuspendSince = 0;
    combatSuspendLoggedAt = 0;

    const current = steps[currentStepIndex];
    if (!current) {
      stopMacro();
      return;
    }

    if (!abortController) return;
    const ac = abortController;
    const stepIndexAtStart = currentStepIndex;

    const { position: playerPos, movementSpeed: rawSpeed } = usePlayerStore.getState();
    const speed = rawSpeed || 1;

    const handler = STEP_HANDLERS[current.kind];
    const ctx: StepContext = {
      playerPos,
      speed,
      signal: ac.signal,
    };

    const result = await handler(current, ctx);

    if (ac.signal.aborted || abortController !== ac) return;

    // A runnable step resets the all-skipped lap guard.
    consecutiveSkips = 0;

    tickTimer = setTimeout(() => {
      if (ac.signal.aborted || abortController !== ac) return;
      if (useMacroLifecycleStore.getState().status !== MacroStatus.Running) return;
      // Live cursor: a mid-handler jump (goToMarker/lifecycle) may have moved
      // it — do not +1 past that step. `jumpTo` is absolute.
      const liveIdx = useMacroNavigationStore.getState().currentStepIndex;
      const nextIndex =
        typeof result.jumpTo === 'number'
          ? result.jumpTo
          : liveIdx !== stepIndexAtStart
            ? liveIdx
            : (liveIdx + 1) % steps.length;
      setCurrentIndex(nextIndex);
      void tick();
    }, result.delayMs);
  } catch (err) {
    if (isAbortError(err)) {
      // pause/stop nulls abortController (halt); positionReset cancel keeps it live → reschedule the same step from the corrected position.
      if (
        abortController &&
        !abortController.signal.aborted &&
        useMacroLifecycleStore.getState().status === MacroStatus.Running
      ) {
        tickTimer = setTimeout(() => {
          if (!abortController || abortController.signal.aborted) return;
          if (useMacroLifecycleStore.getState().status !== MacroStatus.Running) return;
          void tick();
        }, SKIP_DELAY_MS);
      }
      return;
    }

    if (err instanceof MoveRejectedError && err.payload.reason === 'unreachable') {
      if (currentStepKind() === 'walk') {
        skipCurrentStep('sem rota até o destino', abortController);
        return;
      }
      pauseMacro(
        `Passo #${useMacroNavigationStore.getState().currentStepIndex + 1} sem rota até o destino`,
      );
      return;
    }

    if (err instanceof MoveRejectedError && isRecoverableMoveReason(err.payload.reason)) {
      const reason = err.payload.reason;
      const stepIndex = useMacroNavigationStore.getState().currentStepIndex;
      const verdict = recordRejection(reason, stepIndex);

      if (verdict.action === 'pause') {
        const counts = new Map<string, number>();
        for (const r of verdict.windowReasons) counts.set(r, (counts.get(r) ?? 0) + 1);
        const breakdown = [...counts].map(([r, n]) => `${r}×${n}`).join(', ');
        logMacro(
          'error',
          `Loop de stall de movimento (${verdict.windowReasons.length} em ${RECOVERY_WINDOW_MS / 1000}s: ${breakdown}) — pausando`,
        );
        pauseMacro('Stall de movimento persistente — verifique conexão/posição');
        return;
      }

      if (verdict.action === 'skip-step') {
        if (currentStepKind() === 'walk') {
          skipCurrentStep('stall recorrente neste passo', abortController);
          return;
        }
        pauseMacro(
          `Passo #${useMacroNavigationStore.getState().currentStepIndex + 1} com stall recorrente — verifique conexão/posição`,
        );
        return;
      }

      logMacro(
        'warn',
        verdict.deduped
          ? `Stall ripple (${reason}, passo #${stepIndex + 1}, combate=${combatSources.size}) — retry em ${verdict.backoffMs}ms`
          : `Stall de movimento #${verdict.windowCount} (${reason}, passo #${stepIndex + 1}, combate=${combatSources.size}) — retry em ${verdict.backoffMs}ms`,
      );
      tickTimer = setTimeout(() => {
        if (useMacroLifecycleStore.getState().status !== MacroStatus.Running) return;
        void tick();
      }, verdict.backoffMs);
      return;
    }

    pauseMacro(err instanceof Error ? err.message : 'Erro desconhecido no macro');
  }
};

/* ── Lifecycle ───────────────────────────────────────── */

export const startMacro = (fromIndex?: number): void => {
  if (tickTimer !== null) return;

  const steps = useAppConfigStore.getState().config.steps ?? [];
  if (steps.length < 1) return;

  const startIndex = fromIndex ?? 0;
  if (startIndex < 0 || startIndex >= steps.length) return;

  abortController = new AbortController();
  consecutiveSkips = 0;
  resetWalkRecovery();
  clearAvoidTiles();
  useMacroLifecycleStore.getState().start(startIndex);
  logMacro('info', `Macro iniciado (${steps.length} passos)`);
  startCoupledAmbientModules();
  void tick();
};

export const pauseMacro = (reason?: string): void => {
  if (tickTimer !== null) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
  stopCoupledAmbientModules(false);
  abortController?.abort();
  abortController = null;
  cancelAllPending();
  // Drop breaker history so resume within 30s does not re-pause; the tile
  // blacklist survives the pause itself but is cleared on resume (fresh intent).
  resetWalkRecovery();

  useMacroLifecycleStore.getState().pause(reason);
  logMacro(reason ? 'error' : 'info', reason ?? 'Macro pausado');
};

export const resumeMacro = (): void => {
  const status = useMacroLifecycleStore.getState().status;
  const steps = useAppConfigStore.getState().config.steps ?? [];
  if (status !== MacroStatus.Paused || steps.length < 1) return;
  if (tickTimer !== null) return;

  abortController = new AbortController();
  consecutiveSkips = 0;
  resetWalkRecovery();
  // Resume is fresh user intent: drop transient tile hints so the first re-plan
  // is judged by the static map, not by a pre-pause rubberband.
  clearAvoidTiles();
  useMacroLifecycleStore.getState().resume();
  logMacro('info', 'Macro retomado');
  startCoupledAmbientModules();
  void tick();
};

export const stopMacro = (): void => {
  if (tickTimer !== null) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
  stopCoupledAmbientModules(true);
  abortController?.abort();
  abortController = null;
  cancelAllPending();
  resetWalkRecovery();
  clearAvoidTiles();
  scriptSuspendedModules.clear();

  useMacroLifecycleStore.getState().stop();
  logMacro('info', 'Macro parado');
};

if (typeof window !== 'undefined') {
  (window as unknown as { __macroSnapshot?: () => unknown }).__macroSnapshot = () => {
    const lifecycle = useMacroLifecycleStore.getState();
    const nav = useMacroNavigationStore.getState();
    const steps = useAppConfigStore.getState().config.steps ?? [];
    const playerPos = usePlayerStore.getState().position;
    const stepInfo = steps.map((s, i) => {
      const a = getStepAnchor(s);
      return {
        idx: i,
        kind: s.kind,
        anchor: a,
        dist: a ? chebyshev(playerPos, a) : null,
        reachable: a ? chebyshev(playerPos, a) <= MAX_EXECUTION_DISTANCE : true,
      };
    });
    return {
      status: lifecycle.status,
      statusMessage: lifecycle.statusMessage,
      currentStepIndex: nav.currentStepIndex,
      playerPos,
      stepCount: steps.length,
      reachableCount: stepInfo.filter((s) => s.reachable).length,
      ambientCombat: Array.from(combatSources),
      tickerActive: tickTimer !== null,
      walkRecovery: getWalkRecoverySnapshot(),
      steps: stepInfo,
    };
  };
}
