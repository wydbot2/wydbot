import { useEffect } from 'react';

/**
 * Dev-only: Ctrl/Cmd+Shift+M seeds mock player data and jumps to the in-game
 * screen for clean screenshots. No-op (and not bundled) in production builds.
 */
export const useMockPlayerHotkey = (): void => {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        void import('../lib/dev-mock-player').then((m) => m.toggleMockPlayer());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
