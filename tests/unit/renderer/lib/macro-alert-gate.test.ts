/**
 * Unit tests for the macro alert gate (src/renderer/lib/macro-alert-gate.ts).
 *
 * The gate bridges the QuickJS `ctx.alert` host call to the React modal: it
 * opens the modal in the UI store and resolves the awaited promise when the
 * user accepts (or the macro aborts). Covers both resolution paths and the
 * store side-effects.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { requestMacroAlert, acceptMacroAlert } from '../../../../src/renderer/lib/macro-alert-gate';
import { useUIStore } from '../../../../src/renderer/stores/ui-store';

describe('macro-alert-gate', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('opens the modal in the store while pending', () => {
    const controller = new AbortController();
    void requestMacroAlert('cuidado', controller.signal);

    const state = useUIStore.getState();
    expect(state.activeModal).toBe('macro-alert');
    expect(state.macroAlert).toBe('cuidado');
  });

  it('resolves on accept and clears the store', async () => {
    const controller = new AbortController();
    const pending = requestMacroAlert('clique', controller.signal);

    acceptMacroAlert();
    await expect(pending).resolves.toBeUndefined();

    const state = useUIStore.getState();
    expect(state.activeModal).toBeNull();
    expect(state.macroAlert).toBeNull();
  });

  it('resolves on abort and clears the store', async () => {
    const controller = new AbortController();
    const pending = requestMacroAlert('abortar', controller.signal);

    controller.abort();
    await expect(pending).resolves.toBeUndefined();

    expect(useUIStore.getState().macroAlert).toBeNull();
  });

  it('accept after the alert already closed is a no-op', () => {
    const controller = new AbortController();
    const pending = requestMacroAlert('uma vez', controller.signal);
    acceptMacroAlert();
    void pending;

    expect(() => acceptMacroAlert()).not.toThrow();
    expect(useUIStore.getState().activeModal).toBeNull();
  });
});
