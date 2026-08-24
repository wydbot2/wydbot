/**
 * Unit tests for the auth store (Zustand).
 * Tests state management for authentication credentials and token.
 */

import { useAuthStore } from '../../../src/renderer/stores/auth-store';

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAuthStore.getState().reset();
  });

  describe('initial state', () => {
    it('should start with empty credentials', () => {
      const state = useAuthStore.getState();
      expect(state.username).toBe('');
      expect(state.password).toBe('');
      expect(state.token).toBe('');
      expect(state.hardwareIdentitySeed).toBeNull();
      expect(state.proxyListUrl).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('setCredentials', () => {
    it('should set username and password', () => {
      useAuthStore.getState().setCredentials('admin', 'secret123');

      const state = useAuthStore.getState();
      expect(state.username).toBe('admin');
      expect(state.password).toBe('secret123');
    });

    it('should not affect isAuthenticated', () => {
      useAuthStore.getState().setCredentials('user', 'pass');
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('setToken', () => {
    it('should set the token value', () => {
      useAuthStore.getState().setToken('123456');
      expect(useAuthStore.getState().token).toBe('123456');
    });
  });

  describe('setHardwareIdentitySeed', () => {
    it('keeps the session identity seed until the auth state is reset', () => {
      const seed = 'b8b9e4f2-6f1a-4b2c-9b47-1c123456789a';
      useAuthStore.getState().setHardwareIdentitySeed(seed);
      expect(useAuthStore.getState().hardwareIdentitySeed).toBe(seed);

      useAuthStore.getState().clearSecrets();
      expect(useAuthStore.getState().hardwareIdentitySeed).toBe(seed);
    });
  });

  describe('setProxyListUrl', () => {
    it('keeps the proxy source for automatic reconnects', () => {
      const url = 'https://example.com/proxies.txt';
      useAuthStore.getState().setProxyListUrl(url);
      expect(useAuthStore.getState().proxyListUrl).toBe(url);

      useAuthStore.getState().clearSecrets();
      expect(useAuthStore.getState().proxyListUrl).toBe(url);
    });
  });

  describe('setAuthenticated', () => {
    it('should set isAuthenticated to true', () => {
      useAuthStore.getState().setAuthenticated(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('should set isAuthenticated back to false', () => {
      useAuthStore.getState().setAuthenticated(true);
      useAuthStore.getState().setAuthenticated(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all fields to initial values', () => {
      useAuthStore.getState().setCredentials('admin', 'pass');
      useAuthStore.getState().setToken('999');
      useAuthStore.getState().setHardwareIdentitySeed('b8b9e4f2-6f1a-4b2c-9b47-1c123456789a');
      useAuthStore.getState().setAuthenticated(true);

      useAuthStore.getState().reset();

      const state = useAuthStore.getState();
      expect(state.username).toBe('');
      expect(state.password).toBe('');
      expect(state.token).toBe('');
      expect(state.hardwareIdentitySeed).toBeNull();
      expect(state.proxyListUrl).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });
});
