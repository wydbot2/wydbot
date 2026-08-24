import { useEffect, useRef } from 'react';
import { useUIStore } from '../stores/ui-store';
import { useBootProgress } from './use-boot-progress';
import { getWydAPI } from '../lib/electron-api';

const MIN_DISPLAY_MS = 800;
// Terminal-state hold, anchored at the ready ARRIVAL (not App mount): the
// eager-itemdb stage pushes warm-boot elapsed past MIN_DISPLAY_MS, making the
// mount-anchored guard a no-op — without this hold the splash cuts from
// itemdb@96% straight to the login screen without ever presenting "Pronto"/100%.
const MIN_READY_DISPLAY_MS = 450;

export const useSplashController = (): void => {
  const progress = useBootProgress();
  const currentScreen = useUIStore((state) => state.currentScreen);
  const setScreen = useUIStore((state) => state.setScreen);
  const mountedAtRef = useRef<number>(performance.now());
  const readyAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (currentScreen !== 'splash') return;
    if (progress.stage !== 'ready') return;
    readyAtRef.current ??= performance.now();
    const now = performance.now();
    const delay = Math.max(
      0,
      MIN_DISPLAY_MS - (now - mountedAtRef.current),
      MIN_READY_DISPLAY_MS - (now - readyAtRef.current),
    );
    const id = setTimeout(() => {
      getWydAPI()?.notifySplashDone();
      setScreen('login');
    }, delay);
    return () => clearTimeout(id);
  }, [currentScreen, progress.stage, setScreen]);
};
