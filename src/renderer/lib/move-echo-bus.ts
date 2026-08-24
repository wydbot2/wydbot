/**
 * BUS: Renderer-local pub/sub for MOVE_ENQUEUED / MOVE_ANNOUNCED / MOVE_REJECTED.
 * Decouples the single world-bridge subscriber from per-request consumers in gameApi.move.
 *
 * Every payload carries `moveId` so a consumer resolves ONLY on its own
 * request's echo — the bus is broadcast, correlation is the consumer's job.
 * Terminal-event symmetry: every in-flight move resolves with an echo
 * (server-confirmed) OR a rejection (stale-walk / queue-stale / no-result).
 */
import type { MoveChunkStatus } from '@shared/ipc/ipc-api';
import type { MPosition } from '@shared/types';

export interface MoveEcho {
  moveId: number;
  dst: MPosition;
  /** Chunk outcome decided main-side (in-progress / arrived / replan / no-route). */
  status: MoveChunkStatus;
}

export interface MoveEnqueued {
  moveId: number;
  expectedTotalMs: number;
}

type EchoHandler = (echo: MoveEcho) => void;
type EnqueuedHandler = (enq: MoveEnqueued) => void;

const echoHandlers = new Set<EchoHandler>();
const enqueuedHandlers = new Set<EnqueuedHandler>();

export const onMoveEcho = (handler: EchoHandler): (() => void) => {
  echoHandlers.add(handler);
  return () => echoHandlers.delete(handler);
};

export const emitMoveEcho = (echo: MoveEcho): void => {
  for (const handler of Array.from(echoHandlers)) handler(echo);
};

export const onMoveEnqueued = (handler: EnqueuedHandler): (() => void) => {
  enqueuedHandlers.add(handler);
  return () => enqueuedHandlers.delete(handler);
};

export const emitMoveEnqueued = (enq: MoveEnqueued): void => {
  for (const handler of Array.from(enqueuedHandlers)) handler(enq);
};

/** Discriminator for why the move was rejected. Extensible string-literal union. */
export type MoveRejectedReason =
  | 'stale-walk'
  | 'unreachable'
  | 'queue-stale'
  | 'no-result'
  | 'timeout';

/** Transient move failures the engine retries (resync + reschedule + circuit-breaker); others (unreachable / real errors) stay fatal. */
const RECOVERABLE_MOVE_REASONS = new Set<string>([
  'stale-walk',
  'timeout',
  'queue-stale',
  'no-result',
]);
export const isRecoverableMoveReason = (reason: string): boolean =>
  RECOVERABLE_MOVE_REASONS.has(reason);

export interface MoveRejectedPayload {
  /** Absent for direct renderer throws (e.g. unreachable); present for bus rejections. */
  moveId?: number;
  /** Absent for queue-stale / no-result (no server destination echoed). */
  dst?: MPosition;
  reason: MoveRejectedReason;
}

/** Typed error surfaced through `gameApi.move`'s promise when a move is rejected. */
export class MoveRejectedError extends Error {
  constructor(public readonly payload: MoveRejectedPayload) {
    const at = payload.dst ? ` at (${payload.dst.x},${payload.dst.y})` : '';
    super(`Move rejected: ${payload.reason}${at}`);
    this.name = 'MoveRejectedError';
  }
}

type RejectedHandler = (payload: MoveRejectedPayload) => void;
const rejectedHandlers = new Set<RejectedHandler>();

export const onMoveRejected = (handler: RejectedHandler): (() => void) => {
  rejectedHandlers.add(handler);
  return () => rejectedHandlers.delete(handler);
};

export const emitMoveRejected = (payload: MoveRejectedPayload): void => {
  for (const handler of Array.from(rejectedHandlers)) handler(payload);
};
