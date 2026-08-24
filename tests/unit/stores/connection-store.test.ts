/**
 * Unit tests for the connection store (Zustand).
 * Tests state management for server connection status and channel selection.
 */

import { useConnectionStore } from '../../../src/renderer/stores/connection-store';

describe('useConnectionStore', () => {
  beforeEach(() => {
    useConnectionStore.getState().reset();
  });

  describe('initial state', () => {
    it('should start as disconnected with no channel', () => {
      const state = useConnectionStore.getState();
      expect(state.status).toBe('disconnected');
      expect(state.selectedChannel).toBeNull();
      expect(state.errorMessage).toBeNull();
      expect(state.detailMessage).toBeNull();
    });
  });

  describe('state transitions', () => {
    it('should transition from disconnected to connecting', () => {
      useConnectionStore.getState().setStatus('connecting');
      expect(useConnectionStore.getState().status).toBe('connecting');
    });

    it('should transition from connecting to connected', () => {
      useConnectionStore.getState().setStatus('connecting');
      useConnectionStore.getState().setStatus('connected');
      expect(useConnectionStore.getState().status).toBe('connected');
    });

    it('should transition to error state with message', () => {
      useConnectionStore.getState().setError('Connection refused');

      const state = useConnectionStore.getState();
      expect(state.status).toBe('error');
      expect(state.errorMessage).toBe('Connection refused');
    });
  });

  describe('channel selection', () => {
    it('should store the selected server channel', () => {
      const channel = { name: 'Canal 01', ip: '127.0.0.1', port: 8281 };
      useConnectionStore.getState().selectChannel(channel);

      expect(useConnectionStore.getState().selectedChannel).toEqual(channel);
    });
  });

  describe('connection detail', () => {
    it('keeps proxy progress while connecting and clears it once connected', () => {
      useConnectionStore.getState().setDetail('Testando proxy 1/10…');
      useConnectionStore.getState().setStatus('connecting');
      expect(useConnectionStore.getState().detailMessage).toBe('Testando proxy 1/10…');

      useConnectionStore.getState().setStatus('connected');
      expect(useConnectionStore.getState().detailMessage).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset to initial disconnected state', () => {
      useConnectionStore.getState().setStatus('connected');
      useConnectionStore
        .getState()
        .selectChannel({ name: 'Canal 01', ip: '127.0.0.1', port: 8281 });

      useConnectionStore.getState().reset();

      const state = useConnectionStore.getState();
      expect(state.status).toBe('disconnected');
      expect(state.selectedChannel).toBeNull();
      expect(state.errorMessage).toBeNull();
      expect(state.detailMessage).toBeNull();
    });
  });

  describe('error state handling', () => {
    it('should clear error when transitioning to non-error status', () => {
      useConnectionStore.getState().setError('timeout');
      expect(useConnectionStore.getState().errorMessage).toBe('timeout');

      useConnectionStore.getState().setStatus('connecting');
      expect(useConnectionStore.getState().errorMessage).toBeNull();
    });
  });
});
