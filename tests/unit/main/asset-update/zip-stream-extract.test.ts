import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { extractAllowlistedZip } from '@main/asset-update/zip-stream-extract';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

// Feed a buffer as small chunks to exercise streaming across boundaries.
async function* toChunks(buf: Uint8Array, size = 13): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

describe('extractAllowlistedZip', () => {
  it('writes only allowlisted entries (autodrains the rest), mapping paths', async () => {
    const strdef = enc('PT strings payload');
    const obj = enc('object collision bytes');
    const field = enc('terrain sector');
    const zip = zipSync({
      'Lang/PT/strdef.bin': strdef, // → strdef.bin (deflate)
      'object.bin': [obj, { level: 0 }], // → object.bin (STORED, exercises non-inflate path)
      'Env/Field0204.trn': field, // → maps/Field0204.trn
      'UI/strdef.bin': enc('korean original'), // skip (not Lang/PT)
      'mesh/model.msh': enc('mesh blob'), // skip
      'Effect/e.eff': enc('fx'), // skip
    });

    const dir = await mkdtemp(join(tmpdir(), 'wyd-extract-'));
    const reported: string[] = [];
    const { written, clientBinaries } = await extractAllowlistedZip(toChunks(zip), dir, (d) =>
      reported.push(d),
    );

    expect(written.sort()).toEqual(['maps/Field0204.trn', 'object.bin', 'strdef.bin']);
    // onEntry fires once per written file (progress callback).
    expect(reported.sort()).toEqual(written.sort());
    expect(Buffer.from(await readFile(join(dir, 'strdef.bin')))).toEqual(Buffer.from(strdef));
    expect(Buffer.from(await readFile(join(dir, 'object.bin')))).toEqual(Buffer.from(obj));
    expect(Buffer.from(await readFile(join(dir, 'maps/Field0204.trn')))).toEqual(
      Buffer.from(field),
    );
    // skipped entries never hit disk
    expect(await fileExists(join(dir, 'mesh/model.msh'))).toBe(false);
    expect(await fileExists(join(dir, 'UI/strdef.bin'))).toBe(false);
    expect(clientBinaries).toEqual([]);
  });

  it('inspects version.dll in memory without writing it to the asset store', async () => {
    const dll = new Uint8Array(64);
    dll.set(
      [
        0x6a, 0x04, 0x8d, 0x54, 0x24, 0x2c, 0xc7, 0x44, 0x24, 0x2c, 0xc9, 0xc9, 0x00, 0x00, 0x8b,
        0xcf, 0xe8, 0x00, 0x00, 0x00, 0x00, 0x83, 0xc4, 0x04, 0x84, 0xc0, 0x74, 0x10, 0x6a, 0x04,
        0x57,
      ],
      8,
    );
    const zip = zipSync({ 'WYD Global/version.dll': dll });
    const dir = await mkdtemp(join(tmpdir(), 'wyd-extract-'));

    const result = await extractAllowlistedZip(toChunks(zip), dir);

    expect(result.written).toEqual([]);
    expect(result.clientBinaries).toMatchObject([
      { kind: 'version-dll', accountClientVersion: 0x0c9c9301 },
    ]);
    expect(await fileExists(join(dir, 'WYD Global/version.dll'))).toBe(false);
  });

  it('rejects a non-zip body (e.g. a cached 404 HTML page)', async () => {
    const html = enc('<!DOCTYPE html><html>404 - File or directory not found.</html>');
    const dir = await mkdtemp(join(tmpdir(), 'wyd-extract-'));
    await expect(extractAllowlistedZip(toChunks(html), dir)).rejects.toThrow(/not a zip/);
  });

  it('rejects an empty body', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wyd-extract-'));
    await expect(extractAllowlistedZip(toChunks(new Uint8Array(0)), dir)).rejects.toThrow(/empty/);
  });
});
