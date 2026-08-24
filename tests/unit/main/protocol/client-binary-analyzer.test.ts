import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EMBEDDED_KEY_TABLE } from '@main/protocol/crypto-material-embedded';
import {
  analyzeClientBinary,
  clientBinaryKind,
  extractAccountClientVersion,
} from '@main/protocol/client-binary-analyzer';

const versionDllFixture = (datSegment: number): Uint8Array => {
  const bytes = new Uint8Array(64);
  bytes.set(
    [
      0x6a,
      0x04,
      0x8d,
      0x54,
      0x24,
      0x2c,
      0xc7,
      0x44,
      0x24,
      0x2c,
      datSegment & 0xff,
      datSegment >>> 8,
      0x00,
      0x00,
      0x8b,
      0xcf,
      0xe8,
      0x11,
      0x22,
      0x33,
      0x44,
      0x83,
      0xc4,
      0x04,
      0x84,
      0xc0,
      0x74,
      0x10,
      0x6a,
      0x04,
      0x57,
    ],
    9,
  );
  return bytes;
};

describe('client binary analyzer', () => {
  it('recognizes client binary paths case-insensitively', () => {
    expect(clientBinaryKind('WYD Global/VERSION.DLL')).toBe('version-dll');
    expect(clientBinaryKind('bin\\WYD.exe')).toBe('wyd-exe');
    expect(clientBinaryKind('JCore.dll')).toBeNull();
  });

  it('extracts the constrained AccountLogin version and rejects ambiguity', () => {
    expect(extractAccountClientVersion(versionDllFixture(0xc9c9))).toBe(0x0c9c9301);

    const duplicated = new Uint8Array(128);
    duplicated.set(versionDllFixture(0xc9c9), 0);
    duplicated.set(versionDllFixture(0xc9c9), 64);
    expect(extractAccountClientVersion(duplicated)).toBeNull();
  });

  it('hashes WYD.exe bytes and requires exactly one embedded Key Table', () => {
    const wyd = new Uint8Array(EMBEDDED_KEY_TABLE.length + 32);
    wyd.set(EMBEDDED_KEY_TABLE, 16);

    expect(analyzeClientBinary('wyd-exe', wyd)).toEqual({
      kind: 'wyd-exe',
      sha256: createHash('sha256').update(wyd).digest('hex'),
      knownKeyTableMatches: 1,
    });
  });
});
