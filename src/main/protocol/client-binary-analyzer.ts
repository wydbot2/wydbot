import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { EMBEDDED_KEY_TABLE } from './crypto-material-embedded';

export type ClientBinaryKind = 'version-dll' | 'wyd-exe';

export interface ClientBinaryObservation {
  readonly kind: ClientBinaryKind;
  readonly sha256: string;
  /** Present only for version.dll; null means its constrained signature was not unique. */
  readonly accountClientVersion?: number | null;
  /** Present only for WYD.exe; a compatible executable must contain exactly one known table. */
  readonly knownKeyTableMatches?: number;
}

const hashSha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Detect only the two client binaries that can affect the bot's wire compatibility. */
export const clientBinaryKind = (entryPath: string): ClientBinaryKind | null => {
  const name = basename(entryPath.replaceAll('\\', '/')).toLowerCase();
  if (name === 'version.dll') return 'version-dll';
  if (name === 'wyd.exe') return 'wyd-exe';
  return null;
};

/**
 * Extract the AccountLogin DAT segment from version.dll without loading it.
 *
 * The compiler sequence writes a uint16 DAT value to a stack buffer immediately
 * before the helper that patches the live WYD process. Calls/branches and stack
 * offsets are masked, while both stack operands and the surrounding opcodes must
 * agree. Ambiguous or malformed matches are rejected by returning null.
 */
export const extractAccountClientVersion = (bytes: Uint8Array): number | null => {
  const matches: number[] = [];

  for (let i = 0; i + 30 < bytes.length; i += 1) {
    if (
      bytes[i] !== 0x6a ||
      bytes[i + 1] !== 0x04 ||
      bytes[i + 2] !== 0x8d ||
      bytes[i + 3] !== 0x54 ||
      bytes[i + 4] !== 0x24 ||
      bytes[i + 6] !== 0xc7 ||
      bytes[i + 7] !== 0x44 ||
      bytes[i + 8] !== 0x24 ||
      bytes[i + 5] !== bytes[i + 9] ||
      bytes[i + 12] !== 0x00 ||
      bytes[i + 13] !== 0x00 ||
      bytes[i + 14] !== 0x8b ||
      bytes[i + 15] !== 0xcf ||
      bytes[i + 16] !== 0xe8 ||
      bytes[i + 21] !== 0x83 ||
      bytes[i + 22] !== 0xc4 ||
      bytes[i + 23] !== 0x04 ||
      bytes[i + 24] !== 0x84 ||
      bytes[i + 25] !== 0xc0 ||
      bytes[i + 26] !== 0x74 ||
      bytes[i + 28] !== 0x6a ||
      bytes[i + 29] !== 0x04 ||
      bytes[i + 30] !== 0x57
    ) {
      continue;
    }

    const datSegment = bytes[i + 10] | (bytes[i + 11] << 8);
    if (datSegment < 0x8000) continue;
    matches.push((datSegment * 0x1000 + 0x301) >>> 0);
  }

  return matches.length === 1 ? matches[0] : null;
};

const countKnownKeyTables = (bytes: Uint8Array): number => {
  const haystack = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let matches = 0;
  let offset = 0;

  for (;;) {
    const found = haystack.indexOf(EMBEDDED_KEY_TABLE, offset);
    if (found < 0) return matches;
    matches += 1;
    offset = found + 1;
  }
};

/** Analyze a client binary as inert bytes. The binary is never written or executed. */
export const analyzeClientBinary = (
  kind: ClientBinaryKind,
  bytes: Uint8Array,
): ClientBinaryObservation => {
  const base = { kind, sha256: hashSha256(bytes) } as const;

  if (kind === 'version-dll') {
    return { ...base, accountClientVersion: extractAccountClientVersion(bytes) };
  }

  return { ...base, knownKeyTableMatches: countKnownKeyTables(bytes) };
};
