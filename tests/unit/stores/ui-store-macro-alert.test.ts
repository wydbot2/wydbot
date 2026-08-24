/**
 * Unit tests for the macro-alert slice of the UI store
 * (src/renderer/stores/ui-store.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../../src/renderer/stores/ui-store';

describe('useUIStore — macro alert', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('showMacroAlert sets the message and activates the modal', () => {
    useUIStore.getState().showMacroAlert('atenção');
    const state = useUIStore.getState();
    expect(state.macroAlert).toBe('atenção');
    expect(state.activeModal).toBe('macro-alert');
  });

  it('closeMacroAlert clears both', () => {
    useUIStore.getState().showMacroAlert('atenção');
    useUIStore.getState().closeMacroAlert();
    const state = useUIStore.getState();
    expect(state.macroAlert).toBeNull();
    expect(state.activeModal).toBeNull();
  });

  it('reset clears a pending alert', () => {
    useUIStore.getState().showMacroAlert('atenção');
    useUIStore.getState().reset();
    expect(useUIStore.getState().macroAlert).toBeNull();
  });
});
