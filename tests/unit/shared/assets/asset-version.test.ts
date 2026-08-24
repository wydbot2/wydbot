import { describe, expect, it } from 'vitest';
import { decideAssetAction, patchRange, patchUrl } from '@shared/assets/asset-version';

describe('decideAssetAction', () => {
  it('bootstraps on a cold/incomplete store', () => {
    expect(decideAssetAction(0, 712, false)).toBe('bootstrap');
    expect(decideAssetAction(0, 712, true)).toBe('bootstrap'); // version 0 ⇒ cold
    expect(decideAssetAction(700, 712, false)).toBe('bootstrap'); // incomplete ⇒ re-bootstrap
  });
  it('patches when complete but behind', () => {
    expect(decideAssetAction(700, 712, true)).toBe('patch');
    expect(decideAssetAction(711, 712, true)).toBe('patch');
  });
  it('is up-to-date when complete and current (or ahead)', () => {
    expect(decideAssetAction(712, 712, true)).toBe('up-to-date');
    expect(decideAssetAction(713, 712, true)).toBe('up-to-date');
  });
});

describe('patchRange + patchUrl', () => {
  it('produces the inclusive local+1..remote range', () => {
    expect(patchRange(700, 703)).toEqual([701, 702, 703]);
    expect(patchRange(711, 712)).toEqual([712]);
    expect(patchRange(712, 712)).toEqual([]);
  });
  it('never emits patch 0 or negative versions', () => {
    expect(patchRange(0, 3)).toEqual([1, 2, 3]);
    expect(patchRange(-5, 2)).toEqual([1, 2]);
  });
  it('builds the patch zip url', () => {
    expect(patchUrl('https://download.raidhut.com/wyd/Global/', 712)).toBe(
      'https://download.raidhut.com/wyd/Global/712.zip',
    );
  });
});
