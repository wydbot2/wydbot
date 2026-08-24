/**
 * Splash controller: the terminal 'ready' state must hold for
 * MIN_READY_DISPLAY_MS anchored at its arrival (not App mount), while the
 * mount-anchored MIN_DISPLAY_MS still covers ultra-fast boots.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { progress, notifySplashDone, uiState } = vi.hoisted(() => ({
  progress: {
    current: {
      stage: 'icons',
      stageIndex: 1,
      stageCount: 6,
      percent: 40,
      label: 'Carregando recursos…',
    } as Record<string, unknown>,
  },
  notifySplashDone: vi.fn(),
  uiState: {
    currentScreen: 'splash' as string,
    setScreen: vi.fn((s: string) => {
      uiState.currentScreen = s;
    }),
  },
}));

vi.mock('../../../../src/renderer/hooks/use-boot-progress', () => ({
  useBootProgress: () => progress.current,
}));
vi.mock('../../../../src/renderer/lib/electron-api', () => ({
  getWydAPI: () => ({ notifySplashDone }),
}));
vi.mock('../../../../src/renderer/stores/ui-store', () => ({
  useUIStore: (selector: (s: typeof uiState) => unknown) => selector(uiState),
}));

import { useSplashController } from '../../../../src/renderer/hooks/use-splash-controller';

const READY = { stage: 'ready', stageIndex: 5, stageCount: 6, percent: 100, label: 'Pronto' };

describe('useSplashController', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    progress.current = {
      stage: 'icons',
      stageIndex: 1,
      stageCount: 6,
      percent: 40,
      label: 'Carregando recursos…',
    };
    uiState.currentScreen = 'splash';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds the ready state for MIN_READY_DISPLAY_MS on a warm boot (elapsed > MIN_DISPLAY_MS)', async () => {
    const { rerender } = renderHook(() => useSplashController());
    // Warm boot: ready arrives long after the 800ms mount-anchored budget.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    progress.current = { ...READY };
    rerender();

    await act(async () => {
      vi.advanceTimersByTime(449);
    });
    expect(uiState.setScreen).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(uiState.setScreen).toHaveBeenCalledWith('login');
    expect(notifySplashDone).toHaveBeenCalled();
  });

  it('still honors the mount-anchored MIN_DISPLAY_MS on an ultra-fast boot', async () => {
    const { rerender } = renderHook(() => useSplashController());
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    progress.current = { ...READY };
    rerender();

    // max(800 - 100, 450 - 0) = 700ms from the ready arrival.
    await act(async () => {
      vi.advanceTimersByTime(699);
    });
    expect(uiState.setScreen).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(uiState.setScreen).toHaveBeenCalledWith('login');
  });

  it('does nothing while the stage is not ready', async () => {
    renderHook(() => useSplashController());
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(uiState.setScreen).not.toHaveBeenCalled();
    expect(notifySplashDone).not.toHaveBeenCalled();
  });
});
