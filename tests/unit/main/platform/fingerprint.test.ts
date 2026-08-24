import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';

vi.mock('@main/logging', () => ({
  platformLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  deriveSessionHardwareIdentity,
  fingerprintFromGuid,
  parseGuidToBytes,
} from '@main/platform/hardware-identity';

describe('fingerprintFromGuid', () => {
  const UUID = 'B8B9E4F2-6F1A-4B2C-9B47-1C123456789A';

  it('is 8 lowercase hex chars and deterministic', () => {
    const fp = fingerprintFromGuid(UUID);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprintFromGuid(UUID)).toBe(fp);
  });

  it('equals the legacy byte-path hash (macOS/Linux folder name unchanged)', () => {
    const legacy = createHash('sha256').update(parseGuidToBytes(UUID)).digest('hex').slice(0, 8);
    expect(fingerprintFromGuid(UUID)).toBe(legacy);
  });
});

describe('deriveSessionHardwareIdentity', () => {
  const hostMac = Buffer.from('001122334455', 'hex');
  const seed = 'B8B9E4F2-6F1A-4B2C-9B47-1C123456789A';

  it('derives a deterministic GUID + local unicast MAC from the host MAC and UUID', () => {
    const first = deriveSessionHardwareIdentity(hostMac, seed);
    const second = deriveSessionHardwareIdentity(hostMac, seed);

    expect(first.adapterGuid).toEqual(parseGuidToBytes(seed));
    expect(first.mac).toEqual(second.mac);
    expect(first.mac).toHaveLength(6);
    expect(first.mac[0] & 0x01).toBe(0);
    expect(first.mac[0] & 0x02).toBe(0x02);
  });

  it('changes the derived MAC when either the host MAC or UUID changes', () => {
    const base = deriveSessionHardwareIdentity(hostMac, seed).mac;
    const otherHost = deriveSessionHardwareIdentity(Buffer.from('001122334456', 'hex'), seed).mac;
    const otherSeed = deriveSessionHardwareIdentity(
      hostMac,
      'A8B9E4F2-6F1A-4B2C-9B47-1C123456789A',
    ).mac;

    expect(otherHost).not.toEqual(base);
    expect(otherSeed).not.toEqual(base);
  });
});
