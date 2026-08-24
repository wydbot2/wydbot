import { describe, expect, it } from 'vitest';
import {
  ZONE_PORTALS,
  findPortalAt,
  findPortalByCenter,
  isOnPortalPad,
  padRect,
  padTiles,
  portalCenter,
  portalKey,
} from '@shared/constants/zone-portals';

const DEAD_PE_PADS = [
  { x: 744, y: 3820 },
  { x: 3648, y: 3140 },
  { x: 2480, y: 1648 },
] as const;

describe('zone-portals catalog', () => {
  it('has 34 active named pads', () => {
    expect(ZONE_PORTALS).toHaveLength(34);
  });

  it('excludes PE rows without AttributeMap bit 0x10', () => {
    for (const dead of DEAD_PE_PADS) {
      expect(findPortalAt(dead.x, dead.y)).toBeNull();
      expect(findPortalByCenter(dead.x + 1, dead.y + 1)).toBeNull();
    }
  });

  it('findPortalAt matches ice pad on any tile inside 4×4 (incl. 3651,3110)', () => {
    const pad = findPortalAt(3651, 3110);
    expect(pad).not.toBeNull();
    expect(pad?.x).toBe(3648);
    expect(pad?.y).toBe(3108);
    expect(pad?.name).toBe('Reino de Noatun');
    expect(findPortalAt(3648, 3108)?.name).toBe('Reino de Noatun');
    expect(findPortalAt(3651, 3111)?.name).toBe('Reino de Noatun');
  });

  it('findPortalAt matches Noatun Armia pad on any tile inside 4×4', () => {
    const pad = findPortalAt(2117, 2101);
    expect(pad).not.toBeNull();
    expect(pad?.name).toBe('Reino de Noatun');
    expect(pad?.x).toBe(2116);
    expect(pad?.y).toBe(2100);
    expect(findPortalAt(2116, 2100)?.name).toBe('Reino de Noatun');
    expect(findPortalAt(2119, 2103)?.name).toBe('Reino de Noatun');
  });

  it('findPortalAt returns null outside pads', () => {
    expect(findPortalAt(2113, 2101)).toBeNull();
    expect(findPortalAt(0, 0)).toBeNull();
  });

  it('portalCenter and padRect are consistent', () => {
    const pad = ZONE_PORTALS[0];
    const c = portalCenter(pad);
    expect(c).toEqual({ x: pad.x + 1, y: pad.y + 1 });
    const r = padRect(pad);
    expect(r).toEqual({ x0: pad.x, y0: pad.y, x1: pad.x + 3, y1: pad.y + 3 });
    expect(findPortalByCenter(c.x, c.y)).toBe(pad);
  });

  it('padTiles lists all 16 cells; isOnPortalPad matches', () => {
    const pad = ZONE_PORTALS[0];
    const tiles = padTiles(pad);
    expect(tiles).toHaveLength(16);
    expect(tiles[0]).toEqual({ x: pad.x, y: pad.y });
    expect(tiles[15]).toEqual({ x: pad.x + 3, y: pad.y + 3 });
    expect(isOnPortalPad(pad, { x: pad.x + 2, y: pad.y + 1 })).toBe(true);
    expect(isOnPortalPad(pad, { x: pad.x - 1, y: pad.y })).toBe(false);
  });

  it('portalKey is unique per pad', () => {
    const keys = ZONE_PORTALS.map(portalKey);
    expect(new Set(keys).size).toBe(ZONE_PORTALS.length);
  });
});
