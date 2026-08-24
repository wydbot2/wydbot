import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EMBEDDED_KEY_TABLE } from '@main/protocol/crypto-material-embedded';
import {
  beginProtocolCompatibilityCheck,
  blockProtocolCompatibility,
  EMBEDDED_KEY_TABLE_SHA256,
  EMBEDDED_PROTOCOL_COMPATIBILITY,
  EMBEDDED_VERSION_DLL_SHA256,
  EMBEDDED_WYD_EXE_SHA256,
  getAccountClientVersion,
  ProtocolCompatibilityError,
  resolveProtocolCompatibility,
  setProtocolCompatibility,
} from '@main/protocol/protocol-compatibility';

describe('protocol compatibility resolver', () => {
  it('carries protocol state through a data-only asset patch', () => {
    const result = resolveProtocolCompatibility({
      assetVersion: 728,
      previous: EMBEDDED_PROTOCOL_COMPATIBILITY,
      observations: [],
    });

    expect(result.assetVersion).toBe(728);
    expect(result.protocolVersion).toBe(727);
    expect(result.accountClientVersion).toBe(0x0c9c9301);
  });

  it('accepts a known version.dll republished in a later data patch', () => {
    const result = resolveProtocolCompatibility({
      assetVersion: 728,
      previous: EMBEDDED_PROTOCOL_COMPATIBILITY,
      observations: [
        {
          kind: 'version-dll',
          patchVersion: 728,
          sha256: EMBEDDED_VERSION_DLL_SHA256,
          accountClientVersion: 0x0c9c9301,
        },
      ],
    });

    expect(result).toMatchObject({
      assetVersion: 728,
      protocolVersion: 727,
      accountClientVersion: 0x0c9c9301,
      versionDllSha256: EMBEDDED_VERSION_DLL_SHA256,
    });
  });

  it('fails closed for an unknown WYD.exe even if the old Key Table is present', () => {
    expect(() =>
      resolveProtocolCompatibility({
        assetVersion: 728,
        previous: EMBEDDED_PROTOCOL_COMPATIBILITY,
        observations: [
          {
            kind: 'wyd-exe',
            patchVersion: 728,
            sha256: 'b'.repeat(64),
            knownKeyTableMatches: 1,
          },
        ],
      }),
    ).toThrow(ProtocolCompatibilityError);
  });

  it('fails closed when version.dll has no unique supported signature', () => {
    expect(() =>
      resolveProtocolCompatibility({
        assetVersion: 728,
        previous: EMBEDDED_PROTOCOL_COMPATIBILITY,
        observations: [
          {
            kind: 'version-dll',
            patchVersion: 728,
            sha256: 'c'.repeat(64),
            accountClientVersion: null,
          },
        ],
      }),
    ).toThrow(/signed protocol approval required/);
  });

  it('rejects an unknown version.dll hash even when its AccountLogin pattern is valid', () => {
    expect(() =>
      resolveProtocolCompatibility({
        assetVersion: 728,
        previous: EMBEDDED_PROTOCOL_COMPATIBILITY,
        observations: [
          {
            kind: 'version-dll',
            patchVersion: 728,
            sha256: 'd'.repeat(64),
            accountClientVersion: 0x0ca01301,
          },
        ],
      }),
    ).toThrow(/signed protocol approval required/);
  });

  it('fails closed for a newer asset state without prior compatibility or observations', () => {
    expect(() =>
      resolveProtocolCompatibility({
        assetVersion: 728,
        previous: null,
        observations: [],
      }),
    ).toThrow(/no stored or embedded protocol profile/);
  });

  it('bootstraps a data-only future patch when both final client binaries are known', () => {
    const result = resolveProtocolCompatibility({
      assetVersion: 728,
      previous: null,
      observations: [
        {
          kind: 'wyd-exe',
          patchVersion: 0,
          sha256: EMBEDDED_WYD_EXE_SHA256,
          knownKeyTableMatches: 1,
        },
        {
          kind: 'version-dll',
          patchVersion: 0,
          sha256: EMBEDDED_VERSION_DLL_SHA256,
          accountClientVersion: 0x0c9c9301,
        },
      ],
    });

    expect(result).toMatchObject({
      assetVersion: 728,
      protocolVersion: 727,
      keyTableSha256: EMBEDDED_KEY_TABLE_SHA256,
    });
  });

  it('keeps login blocked while compatibility is checking or blocked', () => {
    beginProtocolCompatibilityCheck();
    expect(() => getAccountClientVersion()).toThrow(/checking/);

    blockProtocolCompatibility();
    expect(() => getAccountClientVersion()).toThrow(/blocked/);

    setProtocolCompatibility(EMBEDDED_PROTOCOL_COMPATIBILITY);
    expect(getAccountClientVersion()).toBe(0x0c9c9301);
  });

  it('binds the embedded Key Table hash to the actual installed bytes', () => {
    expect(createHash('sha256').update(EMBEDDED_KEY_TABLE).digest('hex')).toBe(
      EMBEDDED_KEY_TABLE_SHA256,
    );
  });
});
