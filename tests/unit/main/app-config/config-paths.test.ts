import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { isInsideDir, planLegacyMigration } from '@main/app-config/config-paths';

const dir = join('/data', 'w-abc12345');

describe('isInsideDir', () => {
  it('accepts a file directly inside', () => {
    expect(isInsideDir(dir, join(dir, 'x.json'))).toBe(true);
  });

  it('accepts a nested file', () => {
    expect(isInsideDir(dir, join(dir, 'sub', 'x.json'))).toBe(true);
  });

  it('rejects the dir itself', () => {
    expect(isInsideDir(dir, dir)).toBe(false);
  });

  it('rejects parent traversal', () => {
    expect(isInsideDir(dir, join(dir, '..', 'evil.json'))).toBe(false);
  });

  it('rejects a sibling folder', () => {
    expect(isInsideDir(dir, join(dir, '..', 'w-def67890', 'x.json'))).toBe(false);
  });
});

describe('planLegacyMigration', () => {
  const entries = [
    { name: 'w-abc12345', isDirectory: true }, // current
    { name: 'w-def67890', isDirectory: true }, // legacy
    { name: 'w-00000000', isDirectory: true }, // legacy
    { name: 'w-nothex!!', isDirectory: true }, // not the w-<8 hex> shape
    { name: 'w-def67890.json', isDirectory: false }, // a file, not a dir
    { name: 'OtherFolder', isDirectory: true }, // unrelated
  ];

  it('returns legacy w- dirs excluding the current one', () => {
    expect(planLegacyMigration(entries, 'w-abc12345')).toEqual(['w-def67890', 'w-00000000']);
  });

  it('returns empty when only the current dir exists', () => {
    expect(planLegacyMigration([{ name: 'w-abc12345', isDirectory: true }], 'w-abc12345')).toEqual(
      [],
    );
  });
});
