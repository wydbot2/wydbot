/**
 * planStreamRoute avoid-fallback — the avoid set is a path-shaping hint, never a
 * reachability verdict. Over a 1-wide corridor heightmap (walls at y=99/y=101):
 *
 *  - Blacklist sealing the only corridor → the NEXT re-plan falls back to an
 *    avoid-free search and still routes (no 'sem rota' skip).
 *  - A statically unwalkable goal (wall tile) → 'unreachable' skip still fires.
 *
 * Harness mirrors macro-stall-recovery.test.ts: sonner mocked, `move` never
 * echoes (5s echo floor → 2s stall guard → recoverable rejection → re-plan).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { startMacro, stopMacro } from '@renderer/lib/macro-engine';
import { addAvoidTiles } from '@renderer/lib/walk-recovery';
import { getWalkabilityService } from '@renderer/lib/walkability-service';
import { useAppConfigStore } from '@renderer/stores/app-config-store';
import { useMacroNavigationStore } from '@renderer/stores/macro-navigation-store';
import { usePlayerStore } from '@renderer/stores/player-store';
import type { MacroStep } from '@renderer/stores/macro-types';

const WORLD = 4096;

const walk = (id: string, x: number, y: number): MacroStep => ({
  id,
  kind: 'walk',
  mode: 'exact',
  position: { x, y },
});

/** Flat map with full-width walls at y=99 and y=101: y=100 is the only corridor. */
const corridorHeightmap = (): ArrayBuffer => {
  const bytes = new Uint8Array(WORLD * WORLD);
  for (let x = 0; x < WORLD; x++) {
    bytes[99 * WORLD + x] = 0x7f;
    bytes[101 * WORLD + x] = 0x7f;
  }
  return bytes.buffer;
};

const sendRendererLog = vi.fn();
const moveMock = vi.fn();
const setMoveRouteMock = vi.fn();

beforeEach(async () => {
  vi.useFakeTimers();
  stopMacro();
  sendRendererLog.mockClear();
  moveMock.mockClear();
  setMoveRouteMock.mockClear();
  (window as unknown as { wydAPI: unknown }).wydAPI = {
    getWalkabilityHeightmap: async () => ({
      buffer: corridorHeightmap(),
      meta: { width: WORLD, height: WORLD, hash: 'test' },
    }),
    move: moveMock, // never echoes → 5s echo floor → stall guard
    setMoveRoute: setMoveRouteMock,
    sendRendererLog,
  };
  usePlayerStore.getState().updatePosition({ x: 100, y: 100 });
  await getWalkabilityService().ready();
});

afterEach(() => {
  stopMacro();
  vi.useRealTimers();
});

const loggedMessages = (): string[] =>
  sendRendererLog.mock.calls.map(([entry]) => (entry as { message: string }).message);

describe('planStreamRoute — avoid is a hint, never a reachability verdict', () => {
  it('blacklist sealing the only corridor → re-plan falls back avoid-free, no skip', async () => {
    useAppConfigStore.getState().replaceSteps([walk('w1', 105, 100), walk('w2', 108, 100)]);
    startMacro(0);
    await vi.advanceTimersByTimeAsync(0); // plan #1 (corridor open) → move #1
    expect(setMoveRouteMock).toHaveBeenCalledTimes(1);

    addAvoidTiles([{ x: 103, y: 100 }]); // seal the only corridor for the NEXT plan

    // move #1 times out at ~5s → stale-walk at ~5.25s → backoff 500ms → re-plan at ~5.75s.
    await vi.advanceTimersByTimeAsync(6_000);

    expect(setMoveRouteMock.mock.calls.length).toBeGreaterThanOrEqual(2); // fallback planned
    expect(loggedMessages().some((m) => m.includes('sem rota'))).toBe(false);
    expect(useMacroNavigationStore.getState().currentStepIndex).toBe(0); // not skipped
  });

  it('statically unwalkable goal (wall tile) → unreachable skip still fires', async () => {
    useAppConfigStore.getState().replaceSteps([walk('w1', 100, 99), walk('w2', 105, 100)]);
    startMacro(0);
    await vi.advanceTimersByTimeAsync(600); // plan fails → skip after SKIP_DELAY_MS

    expect(loggedMessages().some((m) => m.includes('sem rota até o destino'))).toBe(true);
    expect(useMacroNavigationStore.getState().currentStepIndex).toBe(1);
  });
});
