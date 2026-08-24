/**
 * Unit tests for the hunt-scroll catalog (src/shared/constants/hunt-scroll-catalog.ts).
 *
 * The catalog is DATA ONLY — the "is it a hunt scroll?" classification lives in
 * item-use-kind.ts (covered by item-use-kind.test.ts).
 *
 * Spec: (PotalPos blocks, coord-keyed
 * destinations, scroll identity + 0xdb4 edge). Catalog transcribed from
 * resources/PotalPos.txt; the decisive cross-check is Kefra index 9 → (2269, 3910).
 */
import { describe, it, expect } from 'vitest';
import {
  HUNT_SCROLL_CATALOG,
  resolveHuntScrollDestination,
} from '../../../src/shared/constants/hunt-scroll-catalog';

const KEFRA = 0xd6c;

describe('HUNT_SCROLL_CATALOG', () => {
  it('has exactly 6 scroll blocks of 10 destinations each', () => {
    expect(HUNT_SCROLL_CATALOG.size).toBe(6);
    for (const destinations of HUNT_SCROLL_CATALOG.values()) {
      expect(destinations).toHaveLength(10);
    }
  });

  it('maps Kefra index 9 (array[8]) to "Lich Batama" (2269, 3910) — capture cross-check', () => {
    const dest = HUNT_SCROLL_CATALOG.get(KEFRA)![8];
    expect(dest).toMatchObject({ x: 2269, y: 3910 });
    expect(dest.name).toContain('Lich Batama');
  });

  it('keeps duplicate-named Kefra spots distinct by coordinate', () => {
    const horizon = HUNT_SCROLL_CATALOG.get(KEFRA)!.filter((d) =>
      d.name.includes('Horizon Cropper'),
    );
    expect(horizon.length).toBe(5);
    const uniqueCoords = new Set(horizon.map((d) => `${d.x},${d.y}`));
    expect(uniqueCoords.size).toBe(5);
  });
});

describe('resolveHuntScrollDestination', () => {
  it('resolves an exact coord to its 1-based menu index', () => {
    const r = resolveHuntScrollDestination(KEFRA, 2269, 3910);
    expect(r).not.toBeNull();
    expect(r!.index).toBe(9);
    expect(r!.destination).toMatchObject({ x: 2269, y: 3910 });
  });

  it('snaps a coord within 3 tiles to the nearest destination', () => {
    const r = resolveHuntScrollDestination(KEFRA, 2271, 3911);
    expect(r!.index).toBe(9);
  });

  it('returns null when no destination is within tolerance', () => {
    expect(resolveHuntScrollDestination(KEFRA, 2300, 3910)).toBeNull();
  });

  it('returns null for a non-scroll id (no catalog block)', () => {
    expect(resolveHuntScrollDestination(0xdb4, 2269, 3910)).toBeNull();
  });

  it('breaks coordinate ties toward the lower (file-order) index', () => {
    // Two Meio Orc spots in the Armia block; an equidistant point keeps the first.
    const armia = HUNT_SCROLL_CATALOG.get(0xd68)!;
    const a = armia[1];
    const r = resolveHuntScrollDestination(0xd68, a.x, a.y);
    expect(r!.index).toBe(2); // array[1] → 1-based 2
  });
});
