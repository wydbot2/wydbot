/**
 * AttributeMap bit `0x10` (activation gate). Match: `(x & ~3, y & ~3)`.
 * Wire: C2S `0x290` body-zero → S2C `0x36c` moveType=1. PE has 3 dead rows
 * excluded: (744,3820), (3648,3140), (2480,1648).
 */

/** One zone-portal pad: world-aligned min corner + RE metadata. */
export interface ZonePortal {
  readonly x: number;
  readonly y: number;
  /** strdef destination label (RE metadata; not shown on macro steps). */
  readonly name: string;
  /** Client-side transfer fee in gold (RE metadata). */
  readonly feeGold: number;
}

/** Pad covers world `[x..x+3] × [y..y+3]` (one AttributeMap cell). */
export const ZONE_PORTAL_PAD_SIZE = 4 as const;

/** Active named pads for minimap, macro, and UI. */
export const ZONE_PORTALS: readonly ZonePortal[] = [
  { x: 2116, y: 2100, name: 'Reino de Noatun', feeGold: 700 },
  { x: 2480, y: 1716, name: 'Reino de Noatun', feeGold: 700 },
  { x: 2456, y: 2016, name: 'Reino de Noatun', feeGold: 700 },
  { x: 3648, y: 3108, name: 'Reino de Noatun', feeGold: 700 },
  { x: 1044, y: 1724, name: 'Armia', feeGold: 0 },
  { x: 1044, y: 1716, name: 'Azran', feeGold: 0 },
  { x: 1044, y: 1708, name: 'Erion', feeGold: 0 },
  { x: 1048, y: 1764, name: 'Campo fora do Castelo de Noatun', feeGold: 0 },
  { x: 2140, y: 2068, name: 'Campo Armia', feeGold: 0 },
  { x: 2468, y: 1716, name: 'Campo Azran', feeGold: 0 },
  { x: 2364, y: 2284, name: 'Calabouço', feeGold: 0 },
  { x: 144, y: 3788, name: 'Campo Armia', feeGold: 0 },
  { x: 2668, y: 2156, name: 'Calabouço', feeGold: 0 },
  { x: 144, y: 3772, name: 'Campo Armia', feeGold: 0 },
  { x: 148, y: 3780, name: 'Calabouço 2º Andar', feeGold: 0 },
  { x: 144, y: 3780, name: 'Calabouço 2º Andar', feeGold: 0 },
  { x: 1004, y: 4028, name: 'Calabouço 1º Andar', feeGold: 0 },
  { x: 408, y: 4072, name: 'Calabouço 2º Andar', feeGold: 0 },
  { x: 1004, y: 4064, name: 'Calabouço 1º Andar', feeGold: 0 },
  { x: 1004, y: 3992, name: 'Calabouço 1º Andar', feeGold: 0 },
  { x: 680, y: 4076, name: 'Calabouço 3º Andar', feeGold: 0 },
  { x: 916, y: 3820, name: 'Calabouço 2º Andar', feeGold: 0 },
  { x: 876, y: 3872, name: 'Calabouço 3º Andar', feeGold: 0 },
  { x: 932, y: 3820, name: 'Calabouço 2º Andar', feeGold: 0 },
  { x: 188, y: 188, name: 'Azran', feeGold: 0 },
  { x: 2548, y: 1740, name: 'Calabouço Abandonado', feeGold: 1000 },
  { x: 1824, y: 1772, name: 'Submundo', feeGold: 0 },
  { x: 1172, y: 4080, name: 'Campo Azran', feeGold: 0 },
  { x: 1516, y: 3996, name: 'Submundo 2º Andar', feeGold: 0 },
  { x: 1304, y: 3816, name: 'Submundo 1º Andar', feeGold: 0 },
  { x: 2452, y: 1716, name: 'Campo Azran', feeGold: 0 },
  { x: 2452, y: 1988, name: 'Campo Azran', feeGold: 0 },
  { x: 1052, y: 1708, name: 'Karden', feeGold: 700 },
  { x: 1056, y: 1724, name: 'Campo de Guerra de Reino', feeGold: 0 },
] as const;

/** Inclusive pad rectangle in world tiles. */
export interface ZonePortalRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const padRect = (p: ZonePortal): ZonePortalRect => ({
  x0: p.x,
  y0: p.y,
  x1: p.x + ZONE_PORTAL_PAD_SIZE - 1,
  y1: p.y + ZONE_PORTAL_PAD_SIZE - 1,
});

/** All 16 world tiles of a pad (row-major, min-corner first). */
export const padTiles = (p: ZonePortal): readonly { x: number; y: number }[] => {
  const tiles: { x: number; y: number }[] = [];
  for (let dy = 0; dy < ZONE_PORTAL_PAD_SIZE; dy++) {
    for (let dx = 0; dx < ZONE_PORTAL_PAD_SIZE; dx++) {
      tiles.push({ x: p.x + dx, y: p.y + dy });
    }
  }
  return tiles;
};

/** True when `pos` lies on any tile of the pad. */
export const isOnPortalPad = (p: ZonePortal, pos: { x: number; y: number }): boolean =>
  pos.x >= p.x &&
  pos.x < p.x + ZONE_PORTAL_PAD_SIZE &&
  pos.y >= p.y &&
  pos.y < p.y + ZONE_PORTAL_PAD_SIZE;

/** Center tile used as step anchor / path target. */
export const portalCenter = (p: ZonePortal): { x: number; y: number } => ({
  x: p.x + 1,
  y: p.y + 1,
});

/** Stable key for listbox options (coords unique per pad). */
export const portalKey = (p: ZonePortal): string => `${p.x},${p.y}`;

/** Resolve the pad under a world tile (coords floored to multiples of 4). */
export const findPortalAt = (worldX: number, worldY: number): ZonePortal | null => {
  const qx = worldX & ~3;
  const qy = worldY & ~3;
  for (const p of ZONE_PORTALS) {
    if (p.x === qx && p.y === qy) return p;
  }
  return null;
};

/** Match a step anchor (center) back to its catalog pad, if any. */
export const findPortalByCenter = (x: number, y: number): ZonePortal | null => {
  for (const p of ZONE_PORTALS) {
    const c = portalCenter(p);
    if (c.x === x && c.y === y) return p;
  }
  return null;
};
