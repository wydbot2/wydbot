import { describe, expect, it } from 'vitest';
import {
  MissingPatchError,
  runAssetUpdate,
  type AssetUpdateDeps,
} from '@main/asset-update/asset-update-controller';
import {
  EMBEDDED_PROTOCOL_COMPATIBILITY,
  EMBEDDED_VERSION_DLL_SHA256,
  resolveProtocolCompatibility,
} from '@main/protocol/protocol-compatibility';
import type { ProtocolCompatibility } from '@shared/protocol/protocol-compatibility';

const STORE = '/store';
const STAGING = '/staging';

interface Calls {
  extract: string[];
  writeVersion: [string, number][];
  promote: number;
  resetDir: number;
  copyStore: number;
  progress: string[];
}

async function* oneChunk(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array([0x50, 0x4b]);
}

const makeDeps = (over: Partial<AssetUpdateDeps> = {}): { deps: AssetUpdateDeps; calls: Calls } => {
  const calls: Calls = {
    extract: [],
    writeVersion: [],
    promote: 0,
    resetDir: 0,
    copyStore: 0,
    progress: [],
  };
  const deps: AssetUpdateDeps = {
    storeRoot: STORE,
    stagingRoot: STAGING,
    fetchSource: async () => ({
      name: 'WYD Global',
      version: 3,
      baseZipUrl: 'https://b/Global.zip',
      patchBaseUrl: 'https://b/wyd/Global/',
    }),
    localVersion: async () => 0,
    storeComplete: async (root) => root === STAGING, // cold store, complete staging
    openZipStream: async () => oneChunk(),
    extract: async (chunks, dest) => {
      for await (const _ of chunks) void _;
      calls.extract.push(dest);
      return { written: [], clientBinaries: [] };
    },
    writeVersion: async (root, v) => {
      calls.writeVersion.push([root, v]);
    },
    promote: async () => {
      calls.promote += 1;
    },
    resetDir: async () => {
      calls.resetDir += 1;
    },
    copyStore: async () => {
      calls.copyStore += 1;
    },
    validate: async () => [], // all boot-critical assets parse by default
    isMissingPatch: (err) => err instanceof MissingPatchError,
    protocol: {
      beginCheck: () => {},
      block: () => {},
      read: async () => null,
      resolve: ({ assetVersion }) => ({
        ...EMBEDDED_PROTOCOL_COMPATIBILITY,
        assetVersion,
        protocolVersion: Math.min(assetVersion, EMBEDDED_PROTOCOL_COMPATIBILITY.protocolVersion),
      }),
      install: () => {},
    },
    onProgress: (s) => calls.progress.push(s),
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    ...over,
  };
  return { deps, calls };
};

describe('runAssetUpdate', () => {
  it('proceeds without downloading when up-to-date', async () => {
    const { deps, calls } = makeDeps({
      localVersion: async () => 3,
      storeComplete: async () => true,
    });
    expect(await runAssetUpdate(deps)).toBe('proceed');
    expect(calls.extract).toHaveLength(0);
    expect(calls.promote).toBe(0);
  });

  it('cold bootstrap: base + patches → staging, verify, promote, write version', async () => {
    const { deps, calls } = makeDeps(); // local 0, version 3
    expect(await runAssetUpdate(deps)).toBe('proceed');
    expect(calls.resetDir).toBe(1);
    // base + patch 1,2,3 = 4 extracts, all into staging
    expect(calls.extract).toEqual([STAGING, STAGING, STAGING, STAGING]);
    expect(calls.promote).toBe(1);
    expect(calls.writeVersion).toEqual([[STAGING, 3]]);
  });

  it('blocks when the staged store is incomplete after bootstrap', async () => {
    const { deps, calls } = makeDeps({ storeComplete: async () => false });
    expect(await runAssetUpdate(deps)).toBe('blocked');
    expect(calls.promote).toBe(0);
    expect(calls.writeVersion).toHaveLength(0);
  });

  it('blocks bootstrap (no promote) when the staged assets fail validation', async () => {
    const { deps, calls } = makeDeps({
      validate: async () => [
        { asset: 'SkillData.bin', reason: 'truncated', expected: 'x', actual: 'y' },
      ],
    });
    expect(await runAssetUpdate(deps)).toBe('blocked');
    expect(calls.promote).toBe(0);
    expect(calls.writeVersion).toHaveLength(0);
  });

  it('warm patch: stages a store copy, patches + validates it, promotes once', async () => {
    const { deps, calls } = makeDeps({
      localVersion: async () => 1,
      storeComplete: async () => true,
    });
    expect(await runAssetUpdate(deps)).toBe('proceed');
    expect(calls.copyStore).toBe(1);
    expect(calls.extract).toEqual([STAGING, STAGING]); // patches 2,3 applied to the staged copy
    expect(calls.promote).toBe(1);
    expect(calls.writeVersion).toEqual([[STAGING, 3]]); // committed into staging before promote
  });

  it('warm patch blocks (store untouched) when the staged patch fails validation', async () => {
    const { deps, calls } = makeDeps({
      localVersion: async () => 1,
      storeComplete: async () => true,
      validate: async () => [
        { asset: 'ItemList.bin', reason: 'unknown-layout', expected: 'x', actual: 'y' },
      ],
    });
    expect(await runAssetUpdate(deps)).toBe('blocked');
    expect(calls.promote).toBe(0); // never overwrite the good store
    expect(calls.writeVersion).toHaveLength(0); // never bump the version
  });

  it('tolerates a 404 on the TOP version (manifest ahead of published zip)', async () => {
    const { deps, calls } = makeDeps({
      localVersion: async () => 1,
      storeComplete: async () => true,
      openZipStream: async (url) => {
        if (url.includes('/3.zip')) throw new MissingPatchError(url); // top version missing
        return oneChunk();
      },
    });
    expect(await runAssetUpdate(deps)).toBe('proceed');
    expect(calls.extract).toEqual([STAGING]); // only patch 2, into the staged copy
    expect(calls.promote).toBe(1);
    expect(calls.writeVersion).toEqual([[STAGING, 2]]); // only patch 2 applied
  });

  it('warm patch with only the top version unpublished leaves the store untouched', async () => {
    const { deps, calls } = makeDeps({
      localVersion: async () => 2,
      storeComplete: async () => true,
      openZipStream: async (url) => {
        if (url.includes('/3.zip')) throw new MissingPatchError(url); // only pending patch missing
        return oneChunk();
      },
    });
    expect(await runAssetUpdate(deps)).toBe('proceed');
    expect(calls.promote).toBe(0); // nothing applied → don't rewrite the store
    expect(calls.writeVersion).toEqual([[STORE, 2]]); // one-time protocol-state migration
  });

  it('blocks on a 404 gap below the top version', async () => {
    const { deps, calls } = makeDeps({
      localVersion: async () => 1,
      storeComplete: async () => true,
      openZipStream: async (url) => {
        if (url.includes('/2.zip')) throw new MissingPatchError(url); // mid gap (top is 3)
        return oneChunk();
      },
    });
    expect(await runAssetUpdate(deps)).toBe('blocked');
    expect(calls.promote).toBe(0);
  });

  it('blocks (fail-closed) when the manifest fetch throws', async () => {
    const { deps } = makeDeps({
      fetchSource: async () => {
        throw new Error('offline');
      },
    });
    expect(await runAssetUpdate(deps)).toBe('blocked');
  });

  it('accepts and installs a known version.dll-only patch', async () => {
    let written: ProtocolCompatibility | undefined;
    let installed: ProtocolCompatibility | undefined;
    const { deps, calls } = makeDeps({
      fetchSource: async () => ({
        name: 'WYD Global',
        version: 728,
        baseZipUrl: 'https://b/Global.zip',
        patchBaseUrl: 'https://b/wyd/Global/',
      }),
      localVersion: async () => 727,
      storeComplete: async () => true,
      extract: async (chunks) => {
        for await (const _ of chunks) void _;
        return {
          written: [],
          clientBinaries: [
            {
              kind: 'version-dll',
              sha256: EMBEDDED_VERSION_DLL_SHA256,
              accountClientVersion: 0x0c9c9301,
            },
          ],
        };
      },
      writeVersion: async (_root, _version, compatibility) => {
        written = compatibility;
      },
      protocol: {
        beginCheck: () => {},
        block: () => {},
        read: async () => EMBEDDED_PROTOCOL_COMPATIBILITY,
        resolve: resolveProtocolCompatibility,
        install: (compatibility) => {
          installed = compatibility;
        },
      },
    });

    expect(await runAssetUpdate(deps)).toBe('proceed');
    expect(calls.promote).toBe(1);
    expect(written?.accountClientVersion).toBe(0x0c9c9301);
    expect(installed).toEqual(written);
  });

  it('blocks before promotion when a patch contains an unknown WYD.exe', async () => {
    const { deps, calls } = makeDeps({
      fetchSource: async () => ({
        name: 'WYD Global',
        version: 728,
        baseZipUrl: 'https://b/Global.zip',
        patchBaseUrl: 'https://b/wyd/Global/',
      }),
      localVersion: async () => 727,
      storeComplete: async () => true,
      extract: async (chunks) => {
        for await (const _ of chunks) void _;
        return {
          written: [],
          clientBinaries: [
            {
              kind: 'wyd-exe',
              sha256: 'b'.repeat(64),
              knownKeyTableMatches: 1,
            },
          ],
        };
      },
      protocol: {
        beginCheck: () => {},
        block: () => {},
        read: async () => EMBEDDED_PROTOCOL_COMPATIBILITY,
        resolve: resolveProtocolCompatibility,
        install: () => {},
      },
    });

    expect(await runAssetUpdate(deps)).toBe('protocol-incompatible');
    expect(calls.promote).toBe(0);
    expect(calls.writeVersion).toHaveLength(0);
  });

  it('blocks an up-to-date asset version newer than the embedded profile when state is missing', async () => {
    const { deps, calls } = makeDeps({
      fetchSource: async () => ({
        name: 'WYD Global',
        version: 728,
        baseZipUrl: 'https://b/Global.zip',
        patchBaseUrl: 'https://b/wyd/Global/',
      }),
      localVersion: async () => 728,
      storeComplete: async () => true,
      protocol: {
        beginCheck: () => {},
        block: () => {},
        read: async () => null,
        resolve: resolveProtocolCompatibility,
        install: () => {},
      },
    });

    expect(await runAssetUpdate(deps)).toBe('protocol-incompatible');
    expect(calls.extract).toHaveLength(0);
    expect(calls.writeVersion).toHaveLength(0);
  });

  it('does not rewrite an up-to-date state whose protocol profile already matches', async () => {
    let installed = false;
    const { deps, calls } = makeDeps({
      fetchSource: async () => ({
        name: 'WYD Global',
        version: 727,
        baseZipUrl: 'https://b/Global.zip',
        patchBaseUrl: 'https://b/wyd/Global/',
      }),
      localVersion: async () => 727,
      storeComplete: async () => true,
      protocol: {
        beginCheck: () => {},
        block: () => {},
        read: async () => EMBEDDED_PROTOCOL_COMPATIBILITY,
        resolve: resolveProtocolCompatibility,
        install: () => {
          installed = true;
        },
      },
    });

    expect(await runAssetUpdate(deps)).toBe('proceed');
    expect(calls.writeVersion).toHaveLength(0);
    expect(installed).toBe(true);
  });

  it('commits staged state before promotion and installs it only afterward', async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      fetchSource: async () => ({
        name: 'WYD Global',
        version: 728,
        baseZipUrl: 'https://b/Global.zip',
        patchBaseUrl: 'https://b/wyd/Global/',
      }),
      localVersion: async () => 727,
      storeComplete: async () => true,
      writeVersion: async (root) => {
        order.push(`write:${root}`);
      },
      promote: async () => {
        order.push('promote');
      },
      protocol: {
        beginCheck: () => {},
        block: () => {},
        read: async () => EMBEDDED_PROTOCOL_COMPATIBILITY,
        resolve: resolveProtocolCompatibility,
        install: () => {
          order.push('install');
        },
      },
    });

    expect(await runAssetUpdate(deps)).toBe('proceed');
    expect(order).toEqual([`write:${STAGING}`, 'promote', 'install']);
  });
});
