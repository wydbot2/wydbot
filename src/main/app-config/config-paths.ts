import { isAbsolute, relative, sep } from 'path';

/** True iff `candidate` is a file inside `dataDir` (not the dir itself, no traversal). */
export const isInsideDir = (dataDir: string, candidate: string): boolean => {
  const rel = relative(dataDir, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

const LEGACY_DIR_RE = /^w-[0-9a-f]{8}$/;

/** Names of legacy `w-*` config dirs (≠ current) to consolidate at boot. */
export const planLegacyMigration = (
  entries: { name: string; isDirectory: boolean }[],
  currentBase: string,
): string[] =>
  entries
    .filter((e) => e.isDirectory && e.name !== currentBase && LEGACY_DIR_RE.test(e.name))
    .map((e) => e.name);
