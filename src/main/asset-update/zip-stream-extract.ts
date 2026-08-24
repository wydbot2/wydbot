import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Unzip, UnzipInflate, type UnzipFile } from 'fflate';
import { matchAssetPath } from '@shared/assets/asset-allowlist';
import {
  analyzeClientBinary,
  clientBinaryKind,
  type ClientBinaryObservation,
} from '@main/protocol/client-binary-analyzer';

export interface ExtractResult {
  /** Store-relative dest paths actually written. */
  readonly written: string[];
  /** In-memory static observations; the corresponding PE files are never written. */
  readonly clientBinaries: ClientBinaryObservation[];
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const MAX_CLIENT_BINARY_BYTES = 32 * 1024 * 1024;

/**
 * Stream a zip (async byte chunks) through fflate, writing ONLY allowlisted
 * entries into `destRoot` at their mapped dest path. Non-allowlisted entries are
 * never inflated (autodrain — `start()` is not called), matching the launcher.
 *
 * Rejects a non-zip body (e.g. a Cloudflare-cached IIS 404 HTML page) by checking
 * the local-file-header magic on the first bytes before trusting the stream.
 */
export const extractAllowlistedZip = async (
  chunks: AsyncIterable<Uint8Array>,
  destRoot: string,
  onEntry?: (dest: string) => void,
): Promise<ExtractResult> => {
  const written: string[] = [];
  const clientBinaries: ClientBinaryObservation[] = [];
  const writes: Promise<void>[] = [];
  let streamError: Error | null = null;
  let checkedMagic = false;

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file: UnzipFile) => {
    const entry = matchAssetPath(file.name);
    const binaryKind = clientBinaryKind(file.name);
    if (!entry && !binaryKind) return; // skip → fflate autodrains the file's bytes

    const parts: Uint8Array[] = [];
    let byteLength = 0;
    file.ondata = (err, data, final) => {
      if (err) {
        streamError ??= err instanceof Error ? err : new Error(String(err));
        return;
      }
      byteLength += data.length;
      if (byteLength > MAX_CLIENT_BINARY_BYTES && binaryKind) {
        streamError ??= new Error(
          `extract: ${file.name} exceeds ${MAX_CLIENT_BINARY_BYTES} byte inspection limit`,
        );
        return;
      }
      if (data.length) parts.push(data);
      if (final) {
        const full = Buffer.concat(parts);
        if (binaryKind) clientBinaries.push(analyzeClientBinary(binaryKind, full));
        if (!entry) return;
        const destPath = join(destRoot, entry.dest);
        written.push(entry.dest);
        onEntry?.(entry.dest);
        writes.push(
          (async () => {
            await mkdir(dirname(destPath), { recursive: true });
            await writeFile(destPath, full);
          })(),
        );
      }
    };
    file.start();
  };

  for await (const chunk of chunks) {
    if (chunk.length === 0) continue;
    if (!checkedMagic) {
      checkedMagic = true;
      if (chunk.length < 4 || ZIP_MAGIC.some((b, i) => chunk[i] !== b)) {
        throw new Error('extract: response is not a zip (bad PK magic — likely an error page)');
      }
    }
    unzip.push(chunk, false);
  }
  if (!checkedMagic) throw new Error('extract: empty response body');
  unzip.push(new Uint8Array(0), true);

  await Promise.all(writes);
  if (streamError) throw streamError;
  return { written, clientBinaries };
};
