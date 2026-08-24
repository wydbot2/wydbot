/**
 * End-to-end wiring of the smart stall recovery through the REAL macro engine:
 * a walk step whose moves never echo (dead pipeline) produces recoverable
 * rejections on a deterministic fake-timer cadence (cycle = 5s echo floor +
 * 250ms chunk floor + exponential backoff 500→4000ms):
 *
 *   t≈5250   rejection #1  → retry, backoff 500ms
 *   t≈11000  rejection #2  → retry, backoff 1000ms
 *   t≈17250  rejection #3  → retry, backoff 2000ms
 *   t≈24500  rejection #4  → retry, backoff 4000ms (same step ⇒ no pause)
 *   t≈33750  rejection #5  → retry, backoff 4000ms
 *   t≈43000  rejection #6 (same step) → SKIP-STEP (per-step streak = 6)
 *   t≈48750  rejection #7 on the NEXT step → PAUSE (window > 3 across 2 steps)
 *
 * Harness: sonner mocked; window.wydAPI stubbed (flat heightmap; `move` never
 * echoes, so every gameApi.move hits the 5s echo floor and the 2s stall guard
 * fires right after). Only timers + microtasks drive the whole flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { startMacro, stopMacro, pauseMacro, resumeMacro } from '@renderer/lib/macro-engine';
import { emitMacroEvent, WALKER_SOURCE } from '@renderer/lib/macro-events';
import { emitMoveEcho } from '@renderer/lib/move-echo-bus';
import {
  addAvoidTiles,
  consumeAvoidSet,
  getWalkRecoverySnapshot,
  recordRejection,
  resetWalkRecovery,
  tileKey,
} from '@renderer/lib/walk-recovery';
import { getWalkabilityService } from '@renderer/lib/walkability-service';
import { useAppConfigStore } from '@renderer/stores/app-config-store';
import { useMacroLifecycleStore } from '@renderer/stores/macro-lifecycle-store';
import { useMacroNavigationStore } from '@renderer/stores/macro-navigation-store';
import { usePlayerStore } from '@renderer/stores/player-store';
import { MacroStatus } from '@renderer/stores/macro-status';
import type { MacroStep } from '@renderer/stores/macro-types';

const WORLD = 4096;

const walk = (id: string, x: number, y: number): MacroStep => ({
  id,
  kind: 'walk',
  mode: 'exact',
  position: { x, y },
});

/** Two close walk anchors — the skip-on-stall path advances w1 → w2. */
const STEPS: MacroStep[] = [walk('w1', 108, 100), walk('w2', 116, 100)];

const sendRendererLog = vi.fn();

beforeEach(async () => {
  vi.useFakeTimers();
  stopMacro();
  sendRendererLog.mockClear();
  (window as unknown as { wydAPI: unknown }).wydAPI = {
    getWalkabilityHeightmap: async () => ({
      buffer: new ArrayBuffer(WORLD * WORLD), // flat → fully walkable
      meta: { width: WORLD, height: WORLD, hash: 'test' },
    }),
    move: vi.fn(), // never echoes → 5s echo floor → stall guard
    setMoveRoute: vi.fn(),
    sendRendererLog,
  };
  useAppConfigStore.getState().replaceSteps(STEPS);
  usePlayerStore.getState().updatePosition({ x: 100, y: 100 });
  await getWalkabilityService().ready();
});

afterEach(() => {
  stopMacro();
  vi.useRealTimers();
});

const loggedMessages = (): string[] =>
  sendRendererLog.mock.calls.map(([entry]) => (entry as { message: string }).message);

describe('macro stall recovery — real engine flow', () => {
  it('six counted rejections on the same walk step SKIP it (macro keeps running)', async () => {
    startMacro(0);
    await vi.advanceTimersByTimeAsync(0); // let the first tick reach the echo-floor timer
    await vi.advanceTimersByTimeAsync(44_000); // past rejection #6 (t≈43000) + skip delay

    expect(useMacroNavigationStore.getState().currentStepIndex).toBe(1);
    expect(useMacroLifecycleStore.getState().status).toBe(MacroStatus.Running);
    expect(loggedMessages().some((m) => m.includes('stall recorrente neste passo'))).toBe(true);
    expect(getWalkRecoverySnapshot().window.length).toBeGreaterThanOrEqual(2);
  });

  it('a counted rejection on a second step after the skip PAUSES (systemic stall)', async () => {
    startMacro(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(49_500); // skip step 0 at t≈43500, step 1's rejection at t≈48750

    const lifecycle = useMacroLifecycleStore.getState();
    expect(lifecycle.status).toBe(MacroStatus.Paused);
    expect(lifecycle.statusMessage).toContain('Stall de movimento persistente');
    expect(loggedMessages().some((m) => m.includes('Loop de stall de movimento'))).toBe(true);
  });

  it('moveCompleted from the WALKER source drains the breaker window (wiring)', () => {
    resetWalkRecovery();
    // Explicit `now` values beyond the ripple-dedup window: two COUNTED entries.
    recordRejection('stale-walk', 0, 1_000);
    recordRejection('timeout', 1, 3_000);
    expect(getWalkRecoverySnapshot().window).toHaveLength(2);

    // A non-walker completion must NOT drain the walker's window.
    emitMacroEvent({ kind: 'moveCompleted', source: 'attack-physical', dest: { x: 0, y: 0 } });
    expect(getWalkRecoverySnapshot().window).toHaveLength(2);

    emitMacroEvent({ kind: 'moveCompleted', source: WALKER_SOURCE, dest: { x: 0, y: 0 } });
    expect(getWalkRecoverySnapshot().window).toHaveLength(1);
  });
});

describe('rubberband corridor classification', () => {
  const lastMoveId = (): number => {
    const calls = (window as unknown as { wydAPI: { move: ReturnType<typeof vi.fn> } }).wydAPI.move
      .mock.calls as Array<[{ moveId: number }]>;
    return calls[calls.length - 1][0].moveId;
  };

  it('on-corridor rubberband (fast-forward) adds NO blacklist tiles', async () => {
    startMacro(0); // walk to (108,100) from (100,100)
    await vi.advanceTimersByTimeAsync(0); // first plan done, move in flight

    // Server snaps the player FORWARD along the planned corridor (a real route tile).
    const route = getWalkabilityService().searchRoute(100, 100, 108, 100);
    const mid = route.tiles[Math.floor(route.tiles.length / 2)];
    usePlayerStore.getState().updatePosition(mid);
    emitMacroEvent({ kind: 'positionReset', type: 'rubberband' });
    await vi.advanceTimersByTimeAsync(0);

    expect(getWalkRecoverySnapshot().avoidCount).toBe(0);
  });

  it('off-corridor rubberband blacklists intermediates but NEVER the goal', async () => {
    startMacro(0);
    await vi.advanceTimersByTimeAsync(0);

    // Server snaps the player OFF the planned corridor → genuine dispute.
    usePlayerStore.getState().updatePosition({ x: 104, y: 104 });
    emitMacroEvent({ kind: 'positionReset', type: 'rubberband' });
    await vi.advanceTimersByTimeAsync(0);

    const avoid = consumeAvoidSet();
    expect(avoid.size).toBeGreaterThan(0);
    expect(avoid.has(tileKey({ x: 108, y: 100 }))).toBe(false); // goal never blacklisted
  });

  it('log scenario: rubberband 1 tile before the exact target — step completes, no skip', async () => {
    useAppConfigStore.getState().replaceSteps([walk('w1', 108, 100)]);
    startMacro(0);
    await vi.advanceTimersByTimeAsync(0); // plan #1, move #1 in flight

    // Server fast-forwards to 1 tile from the target.
    const route = getWalkabilityService().searchRoute(100, 100, 108, 100);
    const oneBeforeGoal = route.tiles[route.tiles.length - 2];
    usePlayerStore.getState().updatePosition(oneBeforeGoal);
    emitMacroEvent({ kind: 'positionReset', type: 'rubberband' });
    await vi.advanceTimersByTimeAsync(600); // abort → SKIP_DELAY_MS re-tick → plan #2

    // Server confirms arrival on the re-planned 1-tile leg.
    usePlayerStore.getState().updatePosition({ x: 108, y: 100 });
    emitMoveEcho({ moveId: lastMoveId(), dst: { x: 108, y: 100 }, status: 'arrived' });
    await vi.advanceTimersByTimeAsync(0);

    expect(getWalkRecoverySnapshot().avoidCount).toBe(0); // goal was never poisoned
    expect(loggedMessages().some((m) => m.includes('sem rota'))).toBe(false);
    expect(loggedMessages().some((m) => m.includes('pulado'))).toBe(false);
    expect(useMacroLifecycleStore.getState().status).toBe(MacroStatus.Running);
  });

  it('resume clears the tile blacklist (no instant re-skip from a pre-pause rubberband)', async () => {
    startMacro(0);
    await vi.advanceTimersByTimeAsync(0);
    addAvoidTiles([{ x: 104, y: 100 }]);
    expect(consumeAvoidSet().size).toBe(1);

    pauseMacro();
    resumeMacro();

    expect(consumeAvoidSet().size).toBe(0);
  });
});
