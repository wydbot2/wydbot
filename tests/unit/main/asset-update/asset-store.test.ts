import { mkdir, mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REQUIRED_ASSET_DESTS } from '@shared/assets/asset-allowlist';
import { EMBEDDED_PROTOCOL_COMPATIBILITY } from '@main/protocol/protocol-compatibility';
import {
  isStoreComplete,
  localAssetVersion,
  promoteStaging,
  readAssetState,
  writeAssetState,
} from '@main/asset-update/asset-store';

const tmp = (p: string): Promise<string> => mkdtemp(join(tmpdir(), p));
const touchAll = async (root: string, dests: readonly string[]): Promise<void> => {
  for (const d of dests) {
    const full = join(root, d);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, 'x');
  }
};
const fileExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

describe('asset-store state', () => {
  it('round-trips state and reports version (0 when absent)', async () => {
    const root = await tmp('wyd-store-');
    expect(await localAssetVersion(root)).toBe(0);
    expect(await readAssetState(root)).toBeNull();
    await writeAssetState(root, 727, EMBEDDED_PROTOCOL_COMPATIBILITY);
    expect((await readAssetState(root))?.assetVersion).toBe(727);
    expect(await localAssetVersion(root)).toBe(727);
    expect(await fileExists(join(root, 'state.json.tmp'))).toBe(false);
  });

  it('persists protocol compatibility independently from the asset version field', async () => {
    const root = await tmp('wyd-store-');
    await writeAssetState(root, 727, EMBEDDED_PROTOCOL_COMPATIBILITY);

    expect((await readAssetState(root))?.protocolCompatibility).toEqual(
      EMBEDDED_PROTOCOL_COMPATIBILITY,
    );
  });
});

describe('isStoreComplete', () => {
  it('requires every required dest AND populated Icons/ + maps/ dirs', async () => {
    const root = await tmp('wyd-store-');
    expect(await isStoreComplete(root)).toBe(false);
    // all required exact files, but the cache dirs are still empty
    await touchAll(root, REQUIRED_ASSET_DESTS);
    expect(await isStoreComplete(root)).toBe(false);
    await touchAll(root, ['Icons/itemicon01.wyt']);
    expect(await isStoreComplete(root)).toBe(false); // maps/ still empty
    await touchAll(root, ['maps/m0101.wyt']);
    expect(await isStoreComplete(root)).toBe(true);
  });
});

describe('promoteStaging', () => {
  it('atomically replaces the live store with the staging dir', async () => {
    const base = await tmp('wyd-promote-');
    const root = join(base, 'v1');
    const staging = join(base, '.staging');
    // old store has a stale file; staging has the new set
    await touchAll(root, ['stale.bin']);
    await touchAll(staging, ['ItemList.bin', 'strdef.bin', 'maps/Field0204.trn']);

    await promoteStaging(staging, root);

    expect(await fileExists(join(root, 'ItemList.bin'))).toBe(true);
    expect(await fileExists(join(root, 'maps/Field0204.trn'))).toBe(true);
    expect(await fileExists(join(root, 'stale.bin'))).toBe(false); // old store dropped
    expect(await fileExists(staging)).toBe(false); // staging consumed by rename
  });
});
