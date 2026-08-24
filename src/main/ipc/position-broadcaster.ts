import { IPC } from '@shared/ipc/ipc-channels';
import type { SessionManager } from '@main/session';
import type { IpcSendFn } from './ipc-types';

/** Position broadcast cadence (ms) — ~30 fps tile updates while a leg interpolates. */
const BROADCAST_INTERVAL_MS = 33;

/**
 * Ships the main-side dead-reckoned player position to the renderer while a move
 * leg is interpolating, plus one final tick when it settles. The renderer mirror
 * is written ONLY from this broadcast and from server corrections — there is no
 * send-time snap. Idle (no IPC) when no leg is in flight.
 *
 * Returns a stop function. Safe to start once for the app lifetime: it no-ops
 * whenever there is no active MovementState (pre-login / disconnected).
 */
export const startPositionBroadcaster = (
  session: SessionManager,
  send: IpcSendFn,
): (() => void) => {
  let wasInterpolating = false;
  let lastX = NaN;
  let lastY = NaN;
  let lastEpoch = -1;

  const timer = setInterval(() => {
    const ms = session.getMovementState();
    if (!ms) {
      wasInterpolating = false;
      lastX = NaN;
      lastY = NaN;
      lastEpoch = -1;
      return;
    }
    const now = Date.now();
    const interpolating = ms.isInterpolating(now);
    // Tick while a leg moves, plus the single settle tick after it finishes.
    if (!interpolating && !wasInterpolating) return;
    wasInterpolating = interpolating;

    // Skip duplicate tiles: a leg slower than the tick rate repeats the same tile
    // for several ticks — no need to re-broadcast (avoids redundant IPC + store writes).
    const pos = ms.getPredictedPosition(now);
    if (pos.x === lastX && pos.y === lastY && ms.epoch === lastEpoch) return;
    lastX = pos.x;
    lastY = pos.y;
    lastEpoch = ms.epoch;
    send(IPC.PLAYER_POSITION, { x: pos.x, y: pos.y, epoch: ms.epoch });
  }, BROADCAST_INTERVAL_MS);

  return () => clearInterval(timer);
};
