import { describe, expect, it } from 'vitest';
import { getEntityLivePosition } from '@renderer/lib/entity-position';
import { DIR } from '@shared/ipc/walkability';
import type { Entity, EntityMoveLeg } from '@shared/types';

const NOW = 1_000_000;

const leg = (over: Partial<EntityMoveLeg> = {}): EntityMoveLeg => ({
  src: { x: 10, y: 10 },
  dst: { x: 12, y: 10 },
  codes: [DIR.E, DIR.E],
  speedMove: 6, // perTileMs = round(1000/6) = 167
  startMs: NOW,
  ...over,
});

const entity = (moveLeg: EntityMoveLeg | null, position = { x: 10, y: 10 }): Entity =>
  ({
    index: 1,
    name: 'Orc',
    category: 'monster',
    position,
    moveLeg,
  }) as Entity;

describe('getEntityLivePosition — remote-entity dead reckoning', () => {
  it('returns the anchor position when no leg is in flight', () => {
    expect(getEntityLivePosition(entity(null), NOW)).toEqual({ x: 10, y: 10 });
  });

  it('starts at the leg origin at t = startMs', () => {
    expect(getEntityLivePosition(entity(leg()), NOW)).toEqual({ x: 10, y: 10 });
  });

  it('steps one tile after one per-tile interval', () => {
    expect(getEntityLivePosition(entity(leg()), NOW + 167)).toEqual({ x: 11, y: 10 });
  });

  it('clamps to dst once the leg travel time has elapsed', () => {
    expect(getEntityLivePosition(entity(leg()), NOW + 334)).toEqual({ x: 12, y: 10 });
    expect(getEntityLivePosition(entity(leg()), NOW + 10_000)).toEqual({ x: 12, y: 10 });
  });

  it('follows the direction codes (contour, not straight line)', () => {
    const contour = leg({
      dst: { x: 11, y: 11 },
      codes: [DIR.E, DIR.N],
    });
    // After one step the entity is at (11,10) — the code path — not the straight diagonal.
    expect(getEntityLivePosition(entity(contour), NOW + 167)).toEqual({ x: 11, y: 10 });
    expect(getEntityLivePosition(entity(contour), NOW + 334)).toEqual({ x: 11, y: 11 });
  });

  it('walks a straight Chebyshev line when the packet carries no codes', () => {
    const noCodes = leg({ dst: { x: 13, y: 13 }, codes: [], speedMove: 1 });
    expect(getEntityLivePosition(entity(noCodes), NOW + 1_000)).toEqual({ x: 11, y: 11 });
    expect(getEntityLivePosition(entity(noCodes), NOW + 3_000)).toEqual({ x: 13, y: 13 });
  });

  it('treats a clock before startMs as the leg origin (no negative step)', () => {
    expect(getEntityLivePosition(entity(leg()), NOW - 500)).toEqual({ x: 10, y: 10 });
  });

  it('floors speed 0 to the canonical 1000 ms/tile pace instead of dividing by zero', () => {
    const slow = leg({ speedMove: 0 });
    expect(getEntityLivePosition(entity(slow), NOW + 999)).toEqual({ x: 10, y: 10 });
    expect(getEntityLivePosition(entity(slow), NOW + 1_000)).toEqual({ x: 11, y: 10 });
  });
});
