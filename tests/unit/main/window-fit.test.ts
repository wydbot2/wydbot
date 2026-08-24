import { describe, expect, it } from 'vitest';
import { computeWindowFit } from '@main/lib/window-fit';

const TARGET = { width: 1280, height: 960 };
const MIN = { width: 800, height: 600 };

describe('computeWindowFit', () => {
  it('keeps the target size on a 1920x1080 work area', () => {
    expect(computeWindowFit({ width: 1920, height: 1040 }, TARGET, MIN)).toEqual({
      width: 1280,
      height: 960,
      clamped: false,
    });
  });

  it('shrinks height on a 1366x768 laptop (work area minus taskbar)', () => {
    const fit = computeWindowFit({ width: 1366, height: 728 }, TARGET, MIN);

    expect(fit).toEqual({ width: 1280, height: 712, clamped: true });
  });

  it('shrinks both axes on a 1280x720 display', () => {
    const fit = computeWindowFit({ width: 1280, height: 680 }, TARGET, MIN);

    expect(fit).toEqual({ width: 1264, height: 664, clamped: true });
  });

  it('never goes below the minimum size on tiny displays', () => {
    const fit = computeWindowFit({ width: 700, height: 500 }, TARGET, MIN);

    expect(fit).toEqual({ width: 800, height: 600, clamped: true });
  });

  it('clamps only the overflowing axis', () => {
    const fit = computeWindowFit({ width: 1100, height: 2000 }, TARGET, MIN);

    expect(fit).toEqual({ width: 1084, height: 960, clamped: true });
  });

  it('treats an exact fit as not clamped', () => {
    const fit = computeWindowFit({ width: 1296, height: 976 }, TARGET, MIN);

    expect(fit).toEqual({ width: 1280, height: 960, clamped: false });
  });

  it('honors a custom margin', () => {
    const fit = computeWindowFit({ width: 1366, height: 728 }, TARGET, MIN, 0);

    expect(fit).toEqual({ width: 1280, height: 728, clamped: true });
  });
});
