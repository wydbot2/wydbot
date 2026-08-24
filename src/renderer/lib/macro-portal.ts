import type { MPosition } from '@shared/types';
import {
  findPortalAt,
  findPortalByCenter,
  isOnPortalPad,
  padRect,
  padTiles,
  portalCenter,
  type ZonePortal,
} from '@shared/constants/zone-portals';
import { MAX_LEG_STEPS } from '@shared/constants/movement';
import { perTileMs, WALK_CLICK_SAFETY_MS } from '@shared/lib/movement-math';
import type { ActionHandler } from './macro-engine-types';
import { pauseMacro } from './macro-engine';
import { logMacro } from './macro-log';
import { awaitMove } from './macro-move-request';
import { MoveRejectedError } from './move-echo-bus';
import { pickReachableTileInRect } from './walkability-pickers';
import { getWalkabilityService } from './walkability-service';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from './game-api';
import { MAX_LOOP_ITERATIONS } from './macro-npc-approach';
import { abortableDelay } from './macro-timing';

/** First send + retries on alternate pad tiles. */
export const ZONE_PORTAL_MAX_ATTEMPTS = 3;

export const portalPadSettleMs = (speed: number): number =>
  perTileMs(speed || 1) + WALK_CLICK_SAFETY_MS;

export type PortalApproachOutcome =
  | { status: 'arrived'; tile: MPosition }
  | { status: 'stuck' }
  | { status: 'aborted' };

const tileKey = (p: MPosition): string => `${p.x},${p.y}`;

const pickPortalApproachTarget = (pad: ZonePortal, from: MPosition): MPosition | null => {
  const onPad = pickReachableTileInRect(padRect(pad), from);
  if (onPad) return onPad;

  const center = portalCenter(pad);
  const probe = getWalkabilityService().reachableWithin(
    from.x,
    from.y,
    center.x,
    center.y,
    MAX_LEG_STEPS,
  );
  if (probe.status === 'complete') return center;
  return probe.frontier;
};

/** Reachable pad tile not in `exclude`; null if none left. */
export const pickAlternatePadTile = (
  pad: ZonePortal,
  from: MPosition,
  exclude: readonly MPosition[] = [],
): MPosition | null => {
  const excluded = new Set(exclude.map(tileKey));
  const svc = getWalkabilityService();
  const candidates = padTiles(pad).filter((t) => !excluded.has(tileKey(t)));
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const candidate of candidates) {
    if (
      svc.reachableWithin(from.x, from.y, candidate.x, candidate.y, MAX_LEG_STEPS).status ===
      'complete'
    ) {
      return candidate;
    }
  }
  return candidates[0] ?? null;
};

export const approachPortalPad = async (
  pad: ZonePortal,
  signal: AbortSignal,
): Promise<PortalApproachOutcome> => {
  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    if (signal.aborted) return { status: 'aborted' };

    const myPos = usePlayerStore.getState().position;
    if (isOnPortalPad(pad, myPos)) {
      return { status: 'arrived', tile: myPos };
    }

    const target = pickPortalApproachTarget(pad, myPos);
    if (!target) return { status: 'stuck' };

    try {
      await awaitMove(target, signal, { exact: true });
    } catch (err) {
      if (err instanceof MoveRejectedError && err.payload.reason === 'unreachable') continue;
      throw err;
    }
  }
  return { status: 'stuck' };
};

export const stepToPadTile = async (
  target: MPosition,
  signal: AbortSignal,
): Promise<PortalApproachOutcome> => {
  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    if (signal.aborted) return { status: 'aborted' };
    const myPos = usePlayerStore.getState().position;
    if (myPos.x === target.x && myPos.y === target.y) {
      return { status: 'arrived', tile: myPos };
    }
    try {
      await awaitMove(target, signal, { exact: true });
    } catch (err) {
      if (err instanceof MoveRejectedError && err.payload.reason === 'unreachable') {
        return { status: 'stuck' };
      }
      throw err;
    }
  }
  return { status: 'stuck' };
};

export const resolvePortalStep = (position: MPosition): ZonePortal | null =>
  findPortalByCenter(position.x, position.y) ?? findPortalAt(position.x, position.y);

/** No server walk ACK — give the last 0x36C time to land before 0x290. */
export const settleOnPortalPad = async (pad: ZonePortal, signal: AbortSignal): Promise<boolean> => {
  const speed = usePlayerStore.getState().movementSpeed || 1;
  await abortableDelay(portalPadSettleMs(speed), signal);
  return isOnPortalPad(pad, usePlayerStore.getState().position);
};

const isZonePortalTimeout = (err: unknown): boolean =>
  err instanceof Error && err.message === 'zone portal timeout';

const pausePortal = (msg: string): { delayMs: number } => {
  logMacro('warn', msg);
  pauseMacro(msg);
  return { delayMs: 0 };
};

export const executePortal: ActionHandler = async (step, ctx) => {
  if (step.kind !== 'portal') return { delayMs: 0 };

  const pad = resolvePortalStep(step.position);
  if (!pad) {
    return pausePortal(`Portal (${step.position.x}, ${step.position.y}) — pad desconhecido.`);
  }

  const approach = await approachPortalPad(pad, ctx.signal);
  switch (approach.status) {
    case 'aborted':
      return { delayMs: 0 };
    case 'stuck':
      return pausePortal(`Portal (${pad.x}, ${pad.y}) — não foi possível entrar no pad.`);
    case 'arrived':
      break;
  }

  if (!isOnPortalPad(pad, usePlayerStore.getState().position)) {
    return pausePortal(`Portal (${pad.x}, ${pad.y}) — posição fora do pad após approach.`);
  }

  const triedTiles: MPosition[] = [{ ...usePlayerStore.getState().position }];

  for (let attempt = 1; attempt <= ZONE_PORTAL_MAX_ATTEMPTS; attempt++) {
    if (ctx.signal.aborted) return { delayMs: 0 };

    try {
      const stillOnPad = await settleOnPortalPad(pad, ctx.signal);
      if (!stillOnPad) {
        return pausePortal(`Portal (${pad.x}, ${pad.y}) — posição fora do pad após settle.`);
      }
    } catch {
      return { delayMs: 0 };
    }

    try {
      const dest = await gameApi.useZonePortal(ctx.signal);
      logMacro('info', `Portal → (${dest.x}, ${dest.y})`);
      return { delayMs: 0 };
    } catch (err) {
      if (ctx.signal.aborted) return { delayMs: 0 };

      const stillOnPad = isOnPortalPad(pad, usePlayerStore.getState().position);
      const canRetry = isZonePortalTimeout(err) && stillOnPad && attempt < ZONE_PORTAL_MAX_ATTEMPTS;

      if (!canRetry) {
        const reason = isZonePortalTimeout(err)
          ? 'sem resposta do servidor'
          : err instanceof Error
            ? err.message
            : String(err);
        return pausePortal(`Portal (${pad.x}, ${pad.y}) — teleporte falhou (${reason}).`);
      }

      const from = usePlayerStore.getState().position;
      const nextTile = pickAlternatePadTile(pad, from, triedTiles);
      if (!nextTile) {
        return pausePortal(
          `Portal (${pad.x}, ${pad.y}) — teleporte falhou (sem outro tile no pad).`,
        );
      }

      logMacro(
        'warn',
        `Portal (${pad.x}, ${pad.y}) — sem teleporte, tile (${nextTile.x},${nextTile.y}) retry ${attempt}/${ZONE_PORTAL_MAX_ATTEMPTS}`,
      );

      const restep = await stepToPadTile(nextTile, ctx.signal);
      if (restep.status === 'aborted') return { delayMs: 0 };
      if (restep.status === 'stuck') {
        return pausePortal(`Portal (${pad.x}, ${pad.y}) — não foi possível mudar de tile no pad.`);
      }
      triedTiles.push({ ...nextTile });
    }
  }

  return pausePortal(`Portal (${pad.x}, ${pad.y}) — teleporte falhou (sem resposta do servidor).`);
};
