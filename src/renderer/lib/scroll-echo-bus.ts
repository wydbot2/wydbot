/**
 * BUS: Renderer-local pub/sub for the hunt-scroll teleport DONE echo.
 * Decouples the single world-bridge subscriber from per-request consumers in
 * `gameApi.useTeleportScroll`.
 *
 * Every payload carries `scrollId` so a consumer resolves ONLY on its own
 * request's echo (the bus is broadcast; correlation is the consumer's job).
 * Terminal-event symmetry: every in-flight scroll request resolves with an
 * `ok` echo OR a rejection (`bad-item` / `bad-dest` / `queue-stale`), and the
 * consumer adds a local `timeout` fallback. Mirrors `move-echo-bus.ts`.
 */
import type { TeleportScrollOutcome } from '@shared/ipc/ipc-api';

export interface TeleportScrollEcho {
  scrollId: number;
  outcome: TeleportScrollOutcome;
}

type ScrollHandler = (echo: TeleportScrollEcho) => void;

const handlers = new Set<ScrollHandler>();

export const onTeleportScrollDone = (handler: ScrollHandler): (() => void) => {
  handlers.add(handler);
  return () => handlers.delete(handler);
};

export const emitTeleportScrollDone = (echo: TeleportScrollEcho): void => {
  for (const handler of Array.from(handlers)) handler(echo);
};

/** Why a teleport-scroll request failed (echo outcomes + the local timeout fallback). */
export type ScrollRejectedReason = Exclude<TeleportScrollOutcome, 'ok'> | 'timeout';

/** Typed error surfaced through `gameApi.useTeleportScroll`'s promise on failure. */
export class ScrollRejectedError extends Error {
  constructor(public readonly reason: ScrollRejectedReason) {
    super(`Teleport scroll rejected: ${reason}`);
    this.name = 'ScrollRejectedError';
  }
}
