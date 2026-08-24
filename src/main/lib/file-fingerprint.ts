import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

export interface SourceFingerprint {
  size: number;
  mtimeMs: number;
  sha256: string;
}

export interface SourceFingerprintFast {
  size: number;
  mtimeMs: number;
}

export const fingerprintFast = async (path: string): Promise<SourceFingerprintFast> => {
  const s = await stat(path);
  return { size: s.size, mtimeMs: s.mtimeMs };
};

export const fingerprintDeep = async (path: string): Promise<SourceFingerprint> => {
  const buf = await readFile(path);
  const s = await stat(path);
  return {
    size: buf.length,
    mtimeMs: s.mtimeMs,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
};

export const fingerprintBufferSha256 = (buf: Buffer): string =>
  createHash('sha256').update(buf).digest('hex');

export const fastMatchesDeep = (fast: SourceFingerprintFast, deep: SourceFingerprint): boolean =>
  fast.size === deep.size && fast.mtimeMs === deep.mtimeMs;
