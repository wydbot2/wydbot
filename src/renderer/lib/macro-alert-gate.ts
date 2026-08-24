import { useUIStore } from '../stores/ui-store';

/**
 * Bridges the QuickJS `ctx.alert` host call to the React modal. The main tick
 * loop is sequential and the guest suspends on `await`, so at most one alert is
 * ever open — a single slot is enough.
 */

let active: (() => void) | null = null;

/**
 * Opens the macro-alert modal and resolves when the user accepts. Resolving on
 * abort lets the script resume so the runtime's interrupt handler can unwind it
 * to an `AbortError` cleanly.
 */
export const requestMacroAlert = (message: string, signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve) => {
    const finish = (): void => {
      signal.removeEventListener('abort', finish);
      active = null;
      useUIStore.getState().closeMacroAlert();
      resolve();
    };
    active = finish;
    signal.addEventListener('abort', finish, { once: true });
    useUIStore.getState().showMacroAlert(message);
  });

/** Resolves the open alert. Wired to the dialog's accept button and dismiss. */
export const acceptMacroAlert = (): void => active?.();
