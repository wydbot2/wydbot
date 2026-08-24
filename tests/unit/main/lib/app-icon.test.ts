import { describe, expect, it } from 'vitest';
import { pickExistingIconPath, windowIconPathCandidates } from '@main/lib/app-icon';

describe('windowIconPathCandidates', () => {
  it('prefers png before ico and uses resourcesPath when packaged', () => {
    const paths = windowIconPathCandidates({
      isPackaged: true,
      resourcesPath: 'C:\\app\\resources',
      appPath: 'C:\\app\\resources\\app.asar',
      moduleDir: 'C:\\app\\resources\\app.asar\\out\\main',
    });

    expect(paths[0]).toMatch(/icon\.png$/);
    expect(paths[1]).toMatch(/icon\.ico$/);
    expect(paths.every((p) => p.includes('resources'))).toBe(true);
    expect(paths).toHaveLength(2);
  });

  it('lists build/ candidates for moduleDir and appPath (png before ico)', () => {
    const paths = windowIconPathCandidates({
      isPackaged: false,
      resourcesPath: '/unused',
      appPath: '/repo',
      moduleDir: '/repo/out/main',
    });

    // path.join normalizes `../..` → both dirs collapse to /repo/build
    expect(paths[0]).toMatch(/icon\.png$/);
    expect(paths[1]).toMatch(/icon\.png$/);
    expect(paths[2]).toMatch(/icon\.ico$/);
    expect(paths[3]).toMatch(/icon\.ico$/);
    expect(paths).toHaveLength(4);
  });
});

describe('pickExistingIconPath', () => {
  it('returns the first existing candidate in order', () => {
    const exists = (p: string): boolean => p.endsWith('icon.ico');
    expect(pickExistingIconPath(['/a/icon.png', '/a/icon.ico', '/b/icon.png'], exists)).toBe(
      '/a/icon.ico',
    );
  });

  it('prefers png when both exist', () => {
    const exists = (): boolean => true;
    expect(pickExistingIconPath(['/a/icon.png', '/a/icon.ico'], exists)).toBe('/a/icon.png');
  });

  it('returns undefined when nothing exists', () => {
    expect(pickExistingIconPath(['/missing.png', '/missing.ico'], () => false)).toBe(undefined);
  });
});
