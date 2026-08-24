import { type FC, useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Entity, MPosition } from '@shared/types';
import { chebyshev, euclidean } from '@shared/lib/movement-math';
import { TELEPORT_THRESHOLD } from '@shared/constants/movement';
import {
  ZONE_PORTALS,
  findPortalAt,
  padRect,
  type ZonePortal,
} from '@shared/constants/zone-portals';
import { usePlayerStore } from '../../stores/player-store';
import { useGameStore } from '../../stores/game-store';
import { isSummon } from '../../lib/entity-selectors';
import { isEntityFresh } from '../../lib/entity-freshness';
import { getEntityLivePosition } from '../../lib/entity-position';
import { MAP_TILE_SIZE, hasTile, getMapTileUrl } from '../../lib/map-tiles';
import {
  CANVAS_SIZE,
  MINIMAP_THEME,
  projectToCanvas,
  isInBounds,
  drawMobDot,
  drawPlayerDot,
  drawRouteLines,
  drawStepPin,
  drawPortalPad,
  type CanvasProjection,
} from '../../lib/minimap';
import type { MacroStep } from '../../stores/macro-types';
import { getStepAnchor } from '../../stores/macro-labels';
import { useDevicePixelRatio } from '../../hooks/use-device-pixel-ratio';
import { formatPosition } from '../../lib/format';

const HIT_RADIUS = 10;
const VIEWPORT_TILES = 1;
const TILE_PX = CANVAS_SIZE;
const TILE_SCALE = CANVAS_SIZE / MAP_TILE_SIZE;
const ENTITY_DRAW_RADIUS = 36;

/**
 * Hide other players, summons, and dead entities. Mirrors canonical: 3D view stops
 * drawing a mob the moment its death animation begins. The store entry persists
 * until `0x165 state >= 3` or `0x364` slot reuse.
 */
const isDrawableEntity = (e: Entity, lastTeleportMs: number): boolean =>
  e.category !== 'player_other' &&
  !isSummon(e) &&
  e.isDead !== true &&
  isEntityFresh(e, lastTeleportMs);

export interface CanvasContextMenuEvent {
  worldX: number;
  worldY: number;
  /** Viewport coordinates for fixed positioning */
  clientX: number;
  clientY: number;
  /** Entity under the cursor, if any */
  entity?: Entity;
  /** Zone-portal pad under the cursor, if any */
  portal?: ZonePortal;
}

interface MiniMapCanvasProps {
  size?: number;
  isActive?: boolean;
  autoFollow?: boolean;
  onCanvasClick?: (coords: { x: number; y: number }) => void;
  onEntityClick?: (entity: Entity) => void;
  onCanvasContextMenu?: (e: CanvasContextMenuEvent) => void;
  className?: string;
  steps?: MacroStep[];
  activeStepIndex?: number;
  selectedStepIndex?: number | null;
}

const canvasToWorld = (canvasX: number, canvasY: number, origin: { xx: number; yy: number }) => ({
  x: Math.floor(origin.xx * MAP_TILE_SIZE + canvasX / TILE_SCALE),
  y: Math.floor((origin.yy + VIEWPORT_TILES) * MAP_TILE_SIZE - 1 - canvasY / TILE_SCALE),
});

interface HoveredTarget {
  name: string;
  position: MPosition;
  entity?: Entity;
}

export const MiniMapCanvas: FC<MiniMapCanvasProps> = ({
  size,
  isActive = true,
  autoFollow = false,
  onCanvasClick,
  onEntityClick,
  onCanvasContextMenu,
  className,
  steps,
  activeStepIndex,
  selectedStepIndex,
}) => {
  const { x, y } = usePlayerStore(useShallow((s) => s.position));
  const lastTeleportMs = usePlayerStore((player) => player.lastTeleportMs);
  const entities = useGameStore((s) => s.entities);

  const dpr = useDevicePixelRatio();
  // Backing buffer matches the displayed CSS box × dpr to keep compositor downscale integer (no chromatic LCD-AA bleed).
  const renderedSize = size ?? CANVAS_SIZE;
  const renderScale = (renderedSize / CANVAS_SIZE) * dpr;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tileCache = useRef<Map<string, HTMLImageElement | 'loading' | null>>(new Map());
  const redrawRef = useRef<() => void>(() => {});
  const [viewOrigin, setViewOrigin] = useState({ xx: 0, yy: 0 });
  const spaceHeldRef = useRef(false);
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);
  const dragLastRef = useRef({ clientX: 0, clientY: 0 });
  const posRef = useRef({ x, y });
  posRef.current = { x, y };

  const playerXX = Math.floor(x / MAP_TILE_SIZE);
  const playerYY = Math.floor(y / MAP_TILE_SIZE);

  const resetViewToPlayer = useCallback(() => {
    setViewOrigin({ xx: playerXX, yy: playerYY });
  }, [playerXX, playerYY]);

  // Load tile via the wydmap:// custom protocol (cache populated at bootstrap).
  const loadTile = useCallback((xx: number, yy: number) => {
    const key = `${xx},${yy}`;
    if (tileCache.current.has(key)) return;
    tileCache.current.set(key, 'loading');

    const url = getMapTileUrl(yy, xx);
    if (!url) {
      tileCache.current.set(key, null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      tileCache.current.set(key, img);
      redrawRef.current();
    };
    img.onerror = () => {
      tileCache.current.set(key, null);
    };
    img.src = url;
  }, []);

  // ── Canvas redraw ──────────────────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Map logical coords (0–CANVAS_SIZE) to backing pixels (renderedSize × dpr).
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

    // Background
    ctx.fillStyle = MINIMAP_THEME.bg;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Tiles — draw 2x2 grid for smooth sub-tile panning
    ctx.imageSmoothingEnabled = false;
    const baseXX = Math.floor(viewOrigin.xx);
    const baseYY = Math.floor(viewOrigin.yy);
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tileXX = baseXX + dx;
        const tileYY = baseYY + dy;
        const drawX = (tileXX - viewOrigin.xx) * TILE_PX;
        const drawY = (VIEWPORT_TILES - 1 - (tileYY - viewOrigin.yy)) * TILE_PX;
        const key = `${tileXX},${tileYY}`;
        const tile = tileCache.current.get(key);
        if (tile instanceof HTMLImageElement) {
          ctx.drawImage(tile, drawX, drawY, TILE_PX, TILE_PX);
        }
        if (!tileCache.current.has(key)) loadTile(tileXX, tileYY);
      }
    }
    ctx.imageSmoothingEnabled = true;

    // Shared projection for all world→canvas conversions
    const proj: CanvasProjection = {
      viewOriginXX: viewOrigin.xx,
      viewOriginYY: viewOrigin.yy,
      viewportTiles: VIEWPORT_TILES,
      tilePx: TILE_PX,
      tileScale: TILE_SCALE,
    };

    // Zone-portal pads (ground layer) — after terrain, before entities.
    for (const portal of ZONE_PORTALS) {
      const r = padRect(portal);
      const corners = [
        projectToCanvas(r.x0, r.y0, proj),
        projectToCanvas(r.x1 + 1, r.y0, proj),
        projectToCanvas(r.x0, r.y1 + 1, proj),
        projectToCanvas(r.x1 + 1, r.y1 + 1, proj),
      ];
      if (!corners.some((c) => isInBounds(c.cx, c.cy))) continue;
      drawPortalPad(ctx, corners);
    }

    // Entities — discriminator already segregated NPCs/monsters/players;
    // here we only decide what to draw and pick a color via the category tag.
    for (const entity of entities) {
      if (!isDrawableEntity(entity, lastTeleportMs)) continue;
      const livePos = getEntityLivePosition(entity);
      if (euclidean({ x, y }, livePos) >= ENTITY_DRAW_RADIUS) continue;
      const { cx, cy } = projectToCanvas(livePos.x, livePos.y, proj);
      if (!isInBounds(cx, cy)) continue;
      const isNpc = entity.category === 'npc';
      drawMobDot(ctx, cx, cy, isNpc);
    }

    // Preserve original step index for label/highlight alignment.
    if (steps && steps.length > 0) {
      const anchored = steps.flatMap((s, originalIndex) => {
        const anchor = getStepAnchor(s);
        if (!anchor) return [];
        return [
          {
            anchor,
            isApprox: s.kind === 'walk' && s.mode === 'approx',
            isPortal: s.kind === 'portal',
            originalIndex,
          },
        ];
      });

      const projected = anchored.map((p, i) => ({
        ...projectToCanvas(p.anchor.x, p.anchor.y, proj),
        isApprox: p.isApprox,
        isPortal: p.isPortal,
        originalIndex: p.originalIndex,
        breakBefore: i > 0 && chebyshev(anchored[i - 1].anchor, p.anchor) > TELEPORT_THRESHOLD,
      }));

      drawRouteLines(
        ctx,
        projected,
        activeStepIndex == null
          ? undefined
          : projected.findIndex((p) => p.originalIndex === activeStepIndex),
      );

      for (const { cx, cy, isApprox, isPortal, originalIndex } of projected) {
        drawStepPin(ctx, cx, cy, originalIndex + 1, {
          isApprox,
          isPortal,
          isCurrent: activeStepIndex === originalIndex,
          isSelected: selectedStepIndex === originalIndex,
          isVisited: activeStepIndex != null && originalIndex < activeStepIndex,
        });
      }
    }

    // Player dot (always on top)
    const player = projectToCanvas(x, y, proj);
    if (isInBounds(player.cx, player.cy)) drawPlayerDot(ctx, player.cx, player.cy);
  }, [
    viewOrigin,
    x,
    y,
    entities,
    loadTile,
    steps,
    activeStepIndex,
    selectedStepIndex,
    renderScale,
    lastTeleportMs,
  ]);

  // Keep redrawRef in sync with the latest redrawCanvas callback
  redrawRef.current = redrawCanvas;

  // Center on player when becoming active
  const wasActive = useRef(false);
  useEffect(() => {
    if (isActive && !wasActive.current) {
      resetViewToPlayer();
    }
    wasActive.current = isActive;
  }, [isActive, resetViewToPlayer]);

  // Redraw
  useEffect(() => {
    if (!isActive) return;
    redrawCanvas();
  }, [isActive, redrawCanvas]);

  // Auto-follow: smooth lerp when player leaves visible area (only during macro)
  useEffect(() => {
    if (!isActive || !autoFollow) return;

    let rafId: number;

    const tick = () => {
      if (draggingRef.current) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const { x: px, y: py } = posRef.current;

      setViewOrigin((o) => {
        const proj: CanvasProjection = {
          viewOriginXX: o.xx,
          viewOriginYY: o.yy,
          viewportTiles: VIEWPORT_TILES,
          tilePx: TILE_PX,
          tileScale: TILE_SCALE,
        };
        const { cx, cy } = projectToCanvas(px, py, proj);
        if (isInBounds(cx, cy)) return o;

        const targetXX = Math.floor(px / MAP_TILE_SIZE);
        const targetYY = Math.floor(py / MAP_TILE_SIZE);
        const dist = Math.max(Math.abs(targetXX - o.xx), Math.abs(targetYY - o.yy));

        if (dist > 3) return { xx: targetXX, yy: targetYY };

        const LERP = 0.08;
        const newXX = o.xx + (targetXX - o.xx) * LERP;
        const newYY = o.yy + (targetYY - o.yy) * LERP;

        return {
          xx: Math.abs(newXX - targetXX) < 0.01 ? targetXX : newXX,
          yy: Math.abs(newYY - targetYY) < 0.01 ? targetYY : newYY,
        };
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, autoFollow]);

  // Space-to-pan: track space key, C key, end drag on mouseup
  useEffect(() => {
    if (!isActive) return;
    const canvas = canvasRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && active !== document.body && !canvasRef.current?.contains(active)) return;

      if (e.code === 'KeyC') {
        e.preventDefault();
        resetViewToPlayer();
        return;
      }

      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      if (active instanceof HTMLElement) active.blur();
      spaceHeldRef.current = true;
      if (canvas) canvas.style.cursor = 'grab';
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      spaceHeldRef.current = false;
      if (draggingRef.current) {
        draggingRef.current = false;
        requestAnimationFrame(() => {
          didDragRef.current = false;
        });
      }
      if (canvas) canvas.style.cursor = '';
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (canvas) canvas.style.cursor = spaceHeldRef.current ? 'grab' : '';
      requestAnimationFrame(() => {
        didDragRef.current = false;
      });
    };

    const onWindowBlur = () => {
      spaceHeldRef.current = false;
      if (draggingRef.current) {
        draggingRef.current = false;
        requestAnimationFrame(() => {
          didDragRef.current = false;
        });
      }
      if (canvas) canvas.style.cursor = '';
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onWindowBlur);
      spaceHeldRef.current = false;
      draggingRef.current = false;
      didDragRef.current = false;
      if (canvas) canvas.style.cursor = '';
    };
  }, [isActive, resetViewToPlayer]);

  // Hit-test player first (rendered last, so on top), then mobs
  const findHoveredAtCanvas = useCallback(
    (canvasX: number, canvasY: number): HoveredTarget | undefined => {
      const proj: CanvasProjection = {
        viewOriginXX: viewOrigin.xx,
        viewOriginYY: viewOrigin.yy,
        viewportTiles: VIEWPORT_TILES,
        tilePx: TILE_PX,
        tileScale: TILE_SCALE,
      };

      const p = projectToCanvas(x, y, proj);
      const pdx = canvasX - p.cx;
      const pdy = canvasY - p.cy;
      if (pdx * pdx + pdy * pdy <= HIT_RADIUS * HIT_RADIUS) {
        return { name: 'Você', position: { x, y } };
      }

      for (const entity of entities) {
        if (!isDrawableEntity(entity, lastTeleportMs)) continue;
        const livePos = getEntityLivePosition(entity);
        if (euclidean({ x, y }, livePos) >= ENTITY_DRAW_RADIUS) continue;
        const { cx, cy } = projectToCanvas(livePos.x, livePos.y, proj);
        const dx = canvasX - cx;
        const dy = canvasY - cy;
        if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
          return { name: entity.name, position: livePos, entity };
        }
      }

      return undefined;
    },
    [x, y, entities, viewOrigin, lastTeleportMs],
  );

  // Tooltip + space-drag panning
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // ── Space-drag panning (1:1 content follows cursor) ──
      if (draggingRef.current) {
        const dx = e.clientX - dragLastRef.current.clientX;
        const dy = e.clientY - dragLastRef.current.clientY;
        dragLastRef.current = { clientX: e.clientX, clientY: e.clientY };

        if (dx !== 0 || dy !== 0) {
          didDragRef.current = true;
          const rect = e.currentTarget.getBoundingClientRect();
          setViewOrigin((o) => ({
            xx: o.xx - dx / rect.width,
            yy: o.yy + dy / rect.width,
          }));
        }

        const tooltip = tooltipRef.current;
        if (tooltip) tooltip.style.display = 'none';
        return;
      }

      // ── Normal tooltip ──
      const tooltip = tooltipRef.current;
      if (!tooltip) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
      const canvasY = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);

      const { x: worldX, y: worldY } = canvasToWorld(canvasX, canvasY, viewOrigin);

      const hovered = findHoveredAtCanvas(canvasX, canvasY);

      tooltip.textContent = hovered
        ? `${hovered.name} (${formatPosition(hovered.position)})`
        : formatPosition({ x: worldX, y: worldY });

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;

      let left = mouseX + 14;
      let top = mouseY - 4;

      if (left + tw > rect.width) left = mouseX - tw - 8;
      if (top + th > rect.height) top = mouseY - th - 8;
      if (top < 0) top = mouseY + 18;

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.display = 'block';
    },
    [viewOrigin, findHoveredAtCanvas],
  );

  const handleMouseLeave = useCallback(() => {
    const tooltip = tooltipRef.current;
    if (tooltip) tooltip.style.display = 'none';
    if (draggingRef.current) {
      draggingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = spaceHeldRef.current ? 'grab' : '';
      requestAnimationFrame(() => {
        didDragRef.current = false;
      });
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!spaceHeldRef.current || e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    didDragRef.current = false;
    dragLastRef.current = { clientX: e.clientX, clientY: e.clientY };
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'grabbing';
  }, []);

  // Canvas click -> mob hit or world coords
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (didDragRef.current) return;
      if (!onCanvasClick && !onEntityClick) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
      const canvasY = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);

      if (onEntityClick) {
        const hovered = findHoveredAtCanvas(canvasX, canvasY);
        if (hovered?.entity) {
          onEntityClick(hovered.entity);
          return;
        }
      }

      if (onCanvasClick) {
        onCanvasClick(canvasToWorld(canvasX, canvasY, viewOrigin));
      }
    },
    [onCanvasClick, onEntityClick, viewOrigin, findHoveredAtCanvas],
  );

  // Right-click -> world coords + local position + optional mob
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onCanvasContextMenu) return;
      if (didDragRef.current) return;
      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
      const canvasY = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);

      const { x: worldX, y: worldY } = canvasToWorld(canvasX, canvasY, viewOrigin);

      // Don't allow context menu on void/out-of-map areas (no terrain tile)
      const tileXX = Math.floor(worldX / MAP_TILE_SIZE);
      const tileYY = Math.floor(worldY / MAP_TILE_SIZE);
      if (!hasTile(tileYY, tileXX)) return;

      const entity = findHoveredAtCanvas(canvasX, canvasY)?.entity;
      const portal = findPortalAt(worldX, worldY) ?? undefined;

      onCanvasContextMenu({
        worldX,
        worldY,
        clientX: e.clientX,
        clientY: e.clientY,
        entity,
        portal,
      });
    },
    [onCanvasContextMenu, viewOrigin, findHoveredAtCanvas],
  );

  const haloProj: CanvasProjection = {
    viewOriginXX: viewOrigin.xx,
    viewOriginYY: viewOrigin.yy,
    viewportTiles: VIEWPORT_TILES,
    tilePx: TILE_PX,
    tileScale: TILE_SCALE,
  };
  const haloPlayer = projectToCanvas(x, y, haloProj);
  const haloVisible = isInBounds(haloPlayer.cx, haloPlayer.cy);

  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <div className={`relative ${className ?? ''}`} style={sizeStyle}>
      <canvas
        ref={canvasRef}
        width={Math.round(renderedSize * dpr)}
        height={Math.round(renderedSize * dpr)}
        className="block h-full w-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
      {haloVisible && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${(haloPlayer.cx / CANVAS_SIZE) * 100}%`,
            top: `${(haloPlayer.cy / CANVAS_SIZE) * 100}%`,
          }}
        >
          <div className="h-3.5 w-3.5 rounded-full bg-red-500/35 motion-safe:animate-player-pulse" />
        </div>
      )}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute hidden rounded bg-black/80 px-2 py-1 font-mono text-xs text-white shadow-lg"
      />
    </div>
  );
};
