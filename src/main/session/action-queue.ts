/**
 * QUEUE: Outgoing packet rate limiter (single throttle source).
 *
 * Priority heap + token bucket ensuring packets are sent in-order at a
 * server-safe rate. Each action's `execute` callback returns the cooldown
 * (ms) to wait before the next action of the same `cooldownKey` can drain.
 *
 * Cooldown is DYNAMIC — declared by the action that knows its own timing
 * (walk: chebyshev × unitMs, click: 1000ms, magic: castTime, etc.). On
 * cooldown hit the action waits (set aside + timer), never drops silently —
 * and the next DRAINABLE action executes in its place.
 */
import type { ClientControl } from '@main/protocol';
import { MinHeap, TokenBucket } from '@main/lib';
import { sessionLogger } from '../logging';

// ---------------------------------------------------------------------------
// Priority enum
// ---------------------------------------------------------------------------

export enum EActionPriority {
  EMERGENCY = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
}

// ---------------------------------------------------------------------------
// Action descriptor — execute returns the cooldown (ms) for its own key.
// Packets are built at dequeue time so PacketSecurity.getHashByte()
// increments in send order (server rejects out-of-order hash bytes).
// ---------------------------------------------------------------------------

export interface ActionDescriptor {
  priority: EActionPriority;
  /** Called at dequeue time. Returns cooldownMs to apply to `cooldownKey`. */
  execute: () => number;
  /** Key for per-action cooldown throttle (the packet's opcode constant). */
  cooldownKey?: number;
  /** Timestamp when the action was enqueued (used for FIFO within priority). */
  enqueuedAt: number;
  /** Invoked if the action is discarded as stale — liveness signal for the requester. */
  onDrop?: () => void;
  /** Movement epoch at enqueue; dropped at dequeue if a correction advanced the live epoch. */
  epoch?: number;
  /** Estimated cooldown (ms) this action applies once executed — feeds the queued-backlog estimate. */
  estimatedCooldownMs?: number;
}

// ---------------------------------------------------------------------------
// ActionQueue
// ---------------------------------------------------------------------------

const STALE_ACTION_MS = 10_000;
const DRAIN_BASE_MS = 100;
const DRAIN_JITTER_MS = 20; // +-20ms => 80-120ms

const compareActions = (a: ActionDescriptor, b: ActionDescriptor): number => {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.enqueuedAt - b.enqueuedAt;
};

export class ActionQueue {
  private readonly heap = new MinHeap<ActionDescriptor>(compareActions);
  private readonly bucket = new TokenBucket();
  private readonly cooldowns = new Map<number, number>();
  /** Per-key sum of estimatedCooldownMs for actions still waiting in the heap. */
  private readonly pendingEstimate = new Map<number, number>();

  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set when `drainTimer` is an all-blocked wake (not a token-scheduled drain). */
  private wakeUntil: number | null = null;
  private running = false;

  constructor(private readonly control: ClientControl) {}

  // ---- public API ---------------------------------------------------------

  public enqueue(action: ActionDescriptor): void {
    // Freeze the descriptor so the listener closure (which captured
    // a validated payload) cannot be mutated by any downstream code between
    // enqueue and the execute() call. Belt-and-suspenders for IPC trust boundary.
    Object.freeze(action);
    if (action.cooldownKey !== undefined && action.estimatedCooldownMs) {
      const key = action.cooldownKey;
      this.pendingEstimate.set(
        key,
        (this.pendingEstimate.get(key) ?? 0) + action.estimatedCooldownMs,
      );
    }
    this.heap.push(action);

    // A parked all-blocked wake goes stale on new work: a drainable action must
    // not wait for another key's cooldown; a blocked one may expire even earlier.
    if (this.wakeUntil !== null && this.drainTimer) {
      const now = Date.now();
      const expiry =
        action.cooldownKey !== undefined ? (this.cooldowns.get(action.cooldownKey) ?? 0) : 0;
      if (now >= expiry) {
        clearTimeout(this.drainTimer);
        this.drainTimer = null;
        this.wakeUntil = null;
      } else if (expiry < this.wakeUntil) {
        clearTimeout(this.drainTimer);
        this.drainTimer = null;
        this.parkUntil(expiry);
        return;
      }
    }
    this.scheduleDrain();
  }

  /** Sets an explicit cooldown for a key (e.g. post-skill MOVE lockout). */
  public setCooldown(key: number, durationMs: number): void {
    this.cooldowns.set(key, Date.now() + durationMs);
  }

  /** Remaining cooldown (ms) for a key, or 0 if none is active. */
  public remainingCooldownMs(key: number): number {
    return Math.max(0, (this.cooldowns.get(key) ?? 0) - Date.now());
  }

  /** Sum of queued `estimatedCooldownMs` across all keys (not active cooldowns). */
  public globalPendingEstimateMs(): number {
    let total = 0;
    for (const estimate of this.pendingEstimate.values()) total += estimate;
    return total;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    sessionLogger.info('ActionQueue started');
  }

  public stop(): void {
    this.running = false;

    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.wakeUntil = null;

    this.heap.clear();
    this.cooldowns.clear();
    this.pendingEstimate.clear();

    sessionLogger.info('ActionQueue stopped');
  }

  // ---- drain loop ---------------------------------------------------------

  private releaseEstimate(action: ActionDescriptor): void {
    if (action.cooldownKey === undefined || !action.estimatedCooldownMs) return;
    const next = (this.pendingEstimate.get(action.cooldownKey) ?? 0) - action.estimatedCooldownMs;
    if (next > 0) this.pendingEstimate.set(action.cooldownKey, next);
    else this.pendingEstimate.delete(action.cooldownKey);
  }

  private scheduleDrain(): void {
    if (!this.running || this.drainTimer) return;
    this.wakeUntil = null;

    const wait = this.bucket.tryConsume()
      ? DRAIN_BASE_MS + Math.floor(Math.random() * DRAIN_JITTER_MS * 2) - DRAIN_JITTER_MS
      : this.bucket.msUntilNextToken + 1;

    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.drainOne();
    }, wait);
  }

  /** Sleep until `wake` (a cooldown expiry). Distinct from a token-scheduled drain. */
  private parkUntil(wake: number): void {
    this.wakeUntil = wake;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.wakeUntil = null;
      this.drainOne();
    }, wake - Date.now());
  }

  private drainOne(): void {
    if (!this.running || this.heap.size === 0) return;

    const now = Date.now();
    const deferred: ActionDescriptor[] = [];
    let action: ActionDescriptor | undefined;

    // First drainable action in priority order — a cooldown-blocked heap-top
    // must not freeze the queue behind it.
    while (this.heap.size > 0) {
      const candidate = this.heap.pop()!;

      // Drop a move a server correction has invalidated — the cross-process cancel.
      if (candidate.epoch !== undefined && candidate.epoch < this.control.movementState.epoch) {
        this.releaseEstimate(candidate);
        candidate.onDrop?.();
        continue;
      }

      // Discard stale actions and move on to the next one
      if (now - candidate.enqueuedAt > STALE_ACTION_MS) {
        this.releaseEstimate(candidate);
        candidate.onDrop?.();
        continue;
      }

      // Cooldown still active → set aside; re-queued after the scan
      if (candidate.cooldownKey) {
        const expiresAt = this.cooldowns.get(candidate.cooldownKey) ?? 0;
        if (now < expiresAt) {
          deferred.push(candidate);
          continue;
        }
      }

      action = candidate;
      break;
    }

    for (const d of deferred) this.heap.push(d);

    if (!action) {
      // Every remaining action is cooldown-blocked — wake at the earliest expiry.
      let wake = Infinity;
      for (const d of deferred) {
        const expiresAt = this.cooldowns.get(d.cooldownKey!) ?? 0;
        if (expiresAt < wake) wake = expiresAt;
      }
      if (wake !== Infinity) this.parkUntil(wake);
      return;
    }

    // Reached execute (not deferred) → release its queued estimate.
    this.releaseEstimate(action);

    try {
      const cooldownMs = action.execute();
      if (action.cooldownKey && cooldownMs > 0) {
        this.cooldowns.set(action.cooldownKey, Date.now() + cooldownMs);
      }
    } catch (err) {
      sessionLogger.error(
        `Action execute failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (this.heap.size > 0) this.scheduleDrain();
  }
}
