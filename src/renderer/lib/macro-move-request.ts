import type { MPosition } from '@shared/types';
import { emitMacroEvent, onMacroEvent, WALKER_SOURCE } from './macro-events';
import {
  MoveRejectedError,
  isRecoverableMoveReason,
  type MoveRejectedReason,
} from './move-echo-bus';

export type AwaitMoveOptions = {
  /** Arrive only on the dest tile (no ARRIVE_EPSILON). */
  exact?: boolean;
};

/**
 * Emits `requestMove(source='macro-engine')` and awaits the engine's
 * `moveCompleted` / `moveRejected` ack. Used by macro step handlers
 * (executeWalk, executeInteract) instead of calling `gameApi.move` directly.
 *
 * Rejects with:
 *  - `DOMException('Move aborted', 'AbortError')` on signal abort or rejection reason 'aborted'
 *  - `MoveRejectedError` for `reason === 'stale-walk'` so engine.tick can
 *    differentiate recoverable rubberband rejections from fatal errors
 *  - `Error('Move rejected: <reason> [(detail)]')` for other rejections
 */
export const awaitMove = (
  dest: MPosition,
  signal: AbortSignal,
  opts?: AwaitMoveOptions,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Move aborted', 'AbortError'));
      return;
    }

    const onAbort = (): void => {
      unsub();
      reject(signal.reason ?? new DOMException('Move aborted', 'AbortError'));
    };

    const unsub = onMacroEvent((event) => {
      if (event.kind !== 'moveCompleted' && event.kind !== 'moveRejected') return;
      if (event.source !== WALKER_SOURCE) return;
      unsub();
      signal.removeEventListener('abort', onAbort);

      if (event.kind === 'moveCompleted') {
        if (signal.aborted) {
          reject(new DOMException('Move aborted', 'AbortError'));
        } else {
          resolve();
        }
        return;
      }
      // moveRejected
      if (event.reason === 'aborted') {
        reject(new DOMException('Move aborted', 'AbortError'));
      } else if (event.reason === 'unreachable' || isRecoverableMoveReason(event.reason)) {
        // unreachable is surfaced as MoveRejectedError too, so the engine can skip, not pause.
        reject(new MoveRejectedError({ dst: dest, reason: event.reason as MoveRejectedReason }));
      } else {
        const suffix = event.detail ? ` (${event.detail})` : '';
        reject(new Error(`Move rejected: ${event.reason}${suffix}`));
      }
    });

    signal.addEventListener('abort', onAbort, { once: true });
    emitMacroEvent({
      kind: 'requestMove',
      dest,
      source: WALKER_SOURCE,
      exact: opts?.exact === true,
    });
  });
};
