/** Portal settle + alternate-tile retry on silent 0x290 miss. */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const pauseMacro = vi.fn();
const useZonePortal = vi.fn();
const logMacro = vi.fn();
const awaitMove = vi.fn(async (_dest: { x: number; y: number }): Promise<void> => undefined);
const reachableWithin = vi.fn(() => ({ status: 'complete' as const }));

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../../src/renderer/lib/macro-engine', () => ({
  pauseMacro: (...args: unknown[]) => pauseMacro(...args),
}));
vi.mock('../../../../src/renderer/lib/game-api', () => ({
  gameApi: { useZonePortal: (...args: unknown[]) => useZonePortal(...args) },
}));
vi.mock('../../../../src/renderer/lib/macro-log', () => ({
  logMacro: (...args: unknown[]) => logMacro(...args),
}));
vi.mock('../../../../src/renderer/lib/macro-move-request', () => ({
  awaitMove: (dest: { x: number; y: number }) => awaitMove(dest),
}));
vi.mock('../../../../src/renderer/lib/walkability-service', () => ({
  getWalkabilityService: () => ({
    reachableWithin: () => reachableWithin(),
    getHeight: () => 10,
  }),
}));
vi.mock('../../../../src/renderer/lib/walkability-pickers', () => ({
  pickReachableTileInRect: () => ({ x: 2117, y: 2101 }),
}));

import {
  executePortal,
  pickAlternatePadTile,
  portalPadSettleMs,
  settleOnPortalPad,
  ZONE_PORTAL_MAX_ATTEMPTS,
} from '../../../../src/renderer/lib/macro-portal';
import { usePlayerStore } from '../../../../src/renderer/stores/player-store';
import { WALK_CLICK_SAFETY_MS, perTileMs } from '../../../../src/shared/lib/movement-math';
import type { ZonePortal } from '../../../../src/shared/constants/zone-portals';

const PAD: ZonePortal = { x: 2116, y: 2100, name: 'Reino de Noatun', feeGold: 700 };

const portalStep = {
  id: 'p1',
  kind: 'portal' as const,
  position: { x: 2117, y: 2101 },
};

describe('portalPadSettleMs', () => {
  it('is one tile travel plus walk-click safety', () => {
    expect(portalPadSettleMs(1)).toBe(perTileMs(1) + WALK_CLICK_SAFETY_MS);
  });
});

describe('pickAlternatePadTile', () => {
  it('returns a pad tile different from excluded positions', () => {
    const from = { x: 2117, y: 2101 };
    const alt = pickAlternatePadTile(PAD, from, [from]);
    expect(alt).not.toBeNull();
    expect(alt).not.toEqual(from);
    expect(alt!.x).toBeGreaterThanOrEqual(2116);
    expect(alt!.x).toBeLessThan(2120);
    expect(alt!.y).toBeGreaterThanOrEqual(2100);
    expect(alt!.y).toBeLessThan(2104);
  });

  it('returns null when every pad tile is excluded', () => {
    const all = [
      { x: 2116, y: 2100 },
      { x: 2117, y: 2100 },
      { x: 2118, y: 2100 },
      { x: 2119, y: 2100 },
      { x: 2116, y: 2101 },
      { x: 2117, y: 2101 },
      { x: 2118, y: 2101 },
      { x: 2119, y: 2101 },
      { x: 2116, y: 2102 },
      { x: 2117, y: 2102 },
      { x: 2118, y: 2102 },
      { x: 2119, y: 2102 },
      { x: 2116, y: 2103 },
      { x: 2117, y: 2103 },
      { x: 2118, y: 2103 },
      { x: 2119, y: 2103 },
    ];
    expect(pickAlternatePadTile(PAD, all[0], all)).toBeNull();
  });
});

describe('settleOnPortalPad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePlayerStore.getState().updatePosition({ x: 2117, y: 2101 });
    usePlayerStore.setState({ movementSpeed: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when still on pad after settle', async () => {
    const ac = new AbortController();
    const pending = settleOnPortalPad(PAD, ac.signal);
    await vi.advanceTimersByTimeAsync(portalPadSettleMs(1));
    await expect(pending).resolves.toBe(true);
  });
});

describe('executePortal — settle + alternate-tile retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    awaitMove.mockImplementation(async (dest: { x: number; y: number }) => {
      usePlayerStore.getState().updatePosition(dest);
    });
    usePlayerStore.getState().updatePosition({ x: 2117, y: 2101 });
    usePlayerStore.setState({ movementSpeed: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const runPortal = () => {
    const ac = new AbortController();
    const promise = executePortal(portalStep, {
      playerPos: { x: 2117, y: 2101 },
      speed: 1,
      signal: ac.signal,
    });
    return { ac, promise };
  };

  const flushSettles = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await vi.advanceTimersByTimeAsync(portalPadSettleMs(1));
    }
  };

  it('succeeds on first useZonePortal after one settle', async () => {
    useZonePortal.mockResolvedValueOnce({ x: 1045, y: 1726 });
    const { promise } = runPortal();
    await flushSettles(1);
    await expect(promise).resolves.toEqual({ delayMs: 0 });
    expect(useZonePortal).toHaveBeenCalledTimes(1);
    expect(awaitMove).not.toHaveBeenCalled();
    expect(pauseMacro).not.toHaveBeenCalled();
  });

  it('on timeout walks to another pad tile then retries 0x290', async () => {
    useZonePortal
      .mockRejectedValueOnce(new Error('zone portal timeout'))
      .mockResolvedValueOnce({ x: 1045, y: 1726 });

    const { promise } = runPortal();
    await flushSettles(2);
    await expect(promise).resolves.toEqual({ delayMs: 0 });
    expect(useZonePortal).toHaveBeenCalledTimes(2);
    expect(awaitMove).toHaveBeenCalledTimes(1);
    const dest = awaitMove.mock.calls[0][0];
    expect(dest).not.toEqual({ x: 2117, y: 2101 });
    expect(dest.x).toBeGreaterThanOrEqual(2116);
    expect(dest.x).toBeLessThan(2120);
    expect(logMacro).toHaveBeenCalledWith('warn', expect.stringContaining('tile ('));
    expect(pauseMacro).not.toHaveBeenCalled();
  });

  it('pauses after exhausting retries on timeout', async () => {
    useZonePortal.mockRejectedValue(new Error('zone portal timeout'));

    const { promise } = runPortal();
    await flushSettles(ZONE_PORTAL_MAX_ATTEMPTS);
    await expect(promise).resolves.toEqual({ delayMs: 0 });
    expect(useZonePortal).toHaveBeenCalledTimes(ZONE_PORTAL_MAX_ATTEMPTS);
    // 2 re-steps between 3 attempts
    expect(awaitMove).toHaveBeenCalledTimes(ZONE_PORTAL_MAX_ATTEMPTS - 1);
    expect(pauseMacro).toHaveBeenCalledWith(expect.stringContaining('sem resposta do servidor'));
  });
});
