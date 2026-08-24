/** All numeric sizes in logical canvas-px (640×640). */

import { ENTITY_COLORS } from './entity-colors';
import { MAP_TILE_SIZE } from './map-tiles';

// ── Design Tokens ──────────────────────────────────────────────────────────

/** Internal canvas resolution (always square). */
export const CANVAS_SIZE = 640;

export const MINIMAP_THEME = {
  bg: '#1a1a2e',

  mob: {
    radius: 5,
    color: ENTITY_COLORS.monster.hex,
    alpha: 0.7,
    npcColor: ENTITY_COLORS.npc.hex,
    npcAlpha: 0.85,
  },

  player: {
    radius: 6,
    glowRadius: 10,
    glowColor: 'rgba(239,68,68,0.3)',
    color: ENTITY_COLORS.player_self.hex,
    borderColor: '#ffffff',
    borderWidth: 2,
  },

  routeLine: {
    width: 2,
    color: 'rgba(148,163,184,0.55)',
    visitedColor: 'rgba(148,163,184,0.25)',
  },

  pin: {
    radius: 9,
    activeRadius: 10,
    activeGlowRadius: 13,
    fill: 'rgba(15,23,42,0.9)',
    visitedFill: 'rgba(15,23,42,0.45)',
    font: 'bold 12px sans-serif',
    activeFont: 'bold 13px sans-serif',
    textColor: '#ffffff',
    borderWidth: 1.5,
    activeBorderWidth: 2.5,
    visitedAlpha: 0.4,
    walkBorder: '#22d3ee',
    walkApproxBorder: '#a5b4fc',
    portalBorder: '#f97316',
    portalVisitedBorder: 'rgba(249,115,22,0.35)',
    selectedBorder: '#60a5fa',
    walkVisitedBorder: 'rgba(34,211,238,0.3)',
    walkApproxVisitedBorder: 'rgba(165,180,252,0.3)',
  },

  /** Zone-portal pad — solid orange (not cyan walk, not NPC pink). */
  zonePortal: {
    fill: '#f97316',
    stroke: '#ea580c',
    strokeWidth: 1,
  },
} as const;

const T = MINIMAP_THEME;

/** Apply ~20% alpha. Hex `#rrggbb` gets `33`; `rgba(...)` has its alpha replaced with `0.2`. */
const withAlpha20 = (color: string): string =>
  color.startsWith('#') ? color + '33' : color.replace(/[\d.]+\)$/, '0.2)');

// ── Coordinate Projection ──────────────────────────────────────────────────

/** Bundles the five values needed for world→canvas projection. */
export interface CanvasProjection {
  viewOriginXX: number;
  viewOriginYY: number;
  viewportTiles: number;
  tilePx: number;
  tileScale: number;
}

/** World position → canvas px (Y-flipped: world-Y northward, canvas-Y downward). */
export const projectToCanvas = (
  worldX: number,
  worldY: number,
  proj: CanvasProjection,
): { cx: number; cy: number } => {
  const tileXX = Math.floor(worldX / MAP_TILE_SIZE);
  const tileYY = Math.floor(worldY / MAP_TILE_SIZE);
  return {
    cx: (tileXX - proj.viewOriginXX) * proj.tilePx + (worldX % MAP_TILE_SIZE) * proj.tileScale,
    cy:
      (proj.viewportTiles - 1 - (tileYY - proj.viewOriginYY)) * proj.tilePx +
      (MAP_TILE_SIZE - 1 - (worldY % MAP_TILE_SIZE)) * proj.tileScale,
  };
};

/** Check if canvas coordinates are within the visible canvas area. */
export const isInBounds = (cx: number, cy: number): boolean =>
  cx >= 0 && cx < CANVAS_SIZE && cy >= 0 && cy < CANVAS_SIZE;

// ── Drawing Functions ──────────────────────────────────────────────────────

/** Draw a single mob/entity dot. NPCs are pink; monsters are red. */
export const drawMobDot = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  isNpc: boolean,
): void => {
  ctx.beginPath();
  ctx.arc(cx, cy, T.mob.radius, 0, Math.PI * 2);

  if (isNpc) {
    ctx.fillStyle = T.mob.npcColor;
    ctx.globalAlpha = T.mob.npcAlpha;
  } else {
    ctx.fillStyle = T.mob.color;
    ctx.globalAlpha = T.mob.alpha;
  }
  ctx.fill();

  ctx.globalAlpha = 1;
};

/** Draw the player dot with glow ring. */
export const drawPlayerDot = (ctx: CanvasRenderingContext2D, cx: number, cy: number): void => {
  ctx.beginPath();
  ctx.arc(cx, cy, T.player.glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = T.player.glowColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, T.player.radius, 0, Math.PI * 2);
  ctx.fillStyle = T.player.color;
  ctx.fill();
  ctx.strokeStyle = T.player.borderColor;
  ctx.lineWidth = T.player.borderWidth;
  ctx.stroke();
};

/** Draw connecting route lines between projected step positions; `breakBefore: true` starts a new segment. */
export const drawRouteLines = (
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<{ cx: number; cy: number; breakBefore?: boolean }>,
  activeIndex?: number,
): void => {
  if (points.length < 2) return;
  ctx.lineWidth = T.routeLine.width;
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i + 1].breakBefore) continue;
    ctx.beginPath();
    ctx.moveTo(points[i].cx, points[i].cy);
    ctx.lineTo(points[i + 1].cx, points[i + 1].cy);
    const visited = activeIndex != null && i < activeIndex;
    ctx.strokeStyle = visited ? T.routeLine.visitedColor : T.routeLine.color;
    ctx.stroke();
  }
};

/** Visual state options for a step pin. */
export interface StepPinOptions {
  isApprox: boolean;
  isPortal?: boolean;
  isCurrent: boolean;
  isSelected: boolean;
  isVisited: boolean;
}

/** Draw a filled 4×4 world pad projected to canvas (zone portal). */
export const drawPortalPad = (
  ctx: CanvasRenderingContext2D,
  corners: ReadonlyArray<{ cx: number; cy: number }>,
): void => {
  if (corners.length < 2) return;
  const xs = corners.map((c) => c.cx);
  const ys = corners.map((c) => c.cy);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return;

  const zp = T.zonePortal;
  ctx.fillStyle = zp.fill;
  ctx.fillRect(left, top, w, h);
  ctx.strokeStyle = zp.stroke;
  ctx.lineWidth = zp.strokeWidth;
  ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
};

/** Step pin: dark fill + colored border (cyan=walk, orange=portal, blue=selected) + white number. */
export const drawStepPin = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  label: number,
  opts: StepPinOptions,
): void => {
  const { isApprox, isPortal, isCurrent, isSelected, isVisited } = opts;
  const p = T.pin;

  const radius = isCurrent ? p.activeRadius : p.radius;

  let borderColor: string;
  if (isSelected) {
    borderColor = p.selectedBorder;
  } else if (isPortal) {
    borderColor = isVisited ? p.portalVisitedBorder : p.portalBorder;
  } else if (isVisited) {
    borderColor = isApprox ? p.walkApproxVisitedBorder : p.walkVisitedBorder;
  } else {
    borderColor = isApprox ? p.walkApproxBorder : p.walkBorder;
  }

  if (isCurrent) {
    ctx.beginPath();
    ctx.arc(cx, cy, p.activeGlowRadius, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha20(borderColor);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = isVisited ? p.visitedFill : p.fill;
  ctx.fill();

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = isCurrent ? p.activeBorderWidth : p.borderWidth;
  ctx.stroke();

  ctx.globalAlpha = isVisited ? p.visitedAlpha : 1;
  ctx.fillStyle = p.textColor;
  ctx.font = isCurrent ? p.activeFont : p.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(label), cx, cy);
  ctx.globalAlpha = 1;
};
