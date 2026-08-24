import { describe, expect, it } from 'vitest';
import {
  emptyReconnectBag,
  isBagArmed,
  RECONNECT_CONNECT_TIMEOUT_MS,
  RECONNECT_FAIL,
  RECONNECT_HANDSHAKE_TIMEOUT_MS,
  reconnectBackoffMs,
} from '../../../src/renderer/lib/reconnect-helpers';

describe('isBagArmed', () => {
  it('requires channel, credentials, numeric password, and valid charIndex', () => {
    const base = {
      ...emptyReconnectBag(),
      channel: { name: 'Ch1', ip: '1.2.3.4', port: 8281 },
      username: 'user',
      password: 'secret',
      token: '1234',
      charIndex: 0,
    };
    expect(isBagArmed(base)).toBe(true);
    expect(isBagArmed({ ...base, password: '' })).toBe(false);
    expect(isBagArmed({ ...base, username: '  ' })).toBe(false);
    expect(isBagArmed({ ...base, channel: null })).toBe(false);
    expect(isBagArmed({ ...base, charIndex: 4 })).toBe(false);
    expect(isBagArmed({ ...base, token: '' })).toBe(false);
    expect(isBagArmed({ ...base, token: '123' })).toBe(false);
    expect(isBagArmed({ ...base, token: '1234' })).toBe(true);
  });

  it('rejects null bag', () => {
    expect(isBagArmed(null)).toBe(false);
  });
});

describe('reconnectBackoffMs', () => {
  it('uses 2s for the first attempt, then exponential backoff', () => {
    expect(reconnectBackoffMs(1)).toBe(2000);
    expect(reconnectBackoffMs(2)).toBe(3000);
    expect(reconnectBackoffMs(3)).toBe(6000);
    expect(reconnectBackoffMs(4)).toBe(12000);
    expect(reconnectBackoffMs(5)).toBe(24000);
    expect(reconnectBackoffMs(10)).toBe(60_000);
  });
});

describe('reconnect constants', () => {
  it('connect + handshake timeouts cover dial hang and idle login windows', () => {
    expect(RECONNECT_CONNECT_TIMEOUT_MS).toBe(8_000);
    expect(RECONNECT_HANDSHAKE_TIMEOUT_MS).toBe(15_000);
  });

  it('exports stable UI failure strings', () => {
    expect(RECONNECT_FAIL.MID_PIPELINE).toBe('Desconectado durante reconexão');
    expect(RECONNECT_FAIL.CONNECT_TIMEOUT).toBe('Não foi possível conectar ao servidor');
    expect(RECONNECT_FAIL.HANDSHAKE_TIMEOUT).toBe('Não foi possível autenticar a tempo');
    expect(RECONNECT_FAIL.CREDENTIALS).toBe('Credenciais incompletas.');
  });
});
