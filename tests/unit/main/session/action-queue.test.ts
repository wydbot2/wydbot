/**
 * ActionQueue.globalPendingEstimateMs — the cross-key backlog estimate feeding
 * the MOVE echo deadline (ipc-command-handlers.ts expectedTotalMs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientControl } from '@main/protocol';

vi.mock('@main/logging', () => ({
  sessionLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ActionQueue, EActionPriority } from '@main/session/action-queue';

/** Minimal control stub — the queue only reads `movementState.epoch` at dequeue. */
const makeControl = (epoch = 0): ClientControl =>
  ({ movementState: { epoch } }) as unknown as ClientControl;

const KEY_A = 0x100;
const KEY_B = 0x200;

let queue: ActionQueue;

beforeEach(() => {
  vi.useFakeTimers();
  queue = new ActionQueue(makeControl());
  queue.start();
});

afterEach(() => {
  queue.stop();
  vi.useRealTimers();
});

describe('globalPendingEstimateMs', () => {
  it('is 0 on an empty queue', () => {
    expect(queue.globalPendingEstimateMs()).toBe(0);
  });

  it('sums queued estimates across ALL cooldown keys (cross-key backlog)', () => {
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      estimatedCooldownMs: 300,
      execute: () => 0,
    });
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_B,
      enqueuedAt: Date.now(),
      estimatedCooldownMs: 500,
      execute: () => 0,
    });
    expect(queue.globalPendingEstimateMs()).toBe(800);
  });

  it('ignores actions without an estimated cooldown', () => {
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => 0,
    });
    expect(queue.globalPendingEstimateMs()).toBe(0);
  });

  it('releases each estimate as the action drains', () => {
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      estimatedCooldownMs: 300,
      execute: () => 0,
    });
    expect(queue.globalPendingEstimateMs()).toBe(300);
    vi.advanceTimersByTime(500); // token bucket starts full → drains within ~120ms
    expect(queue.globalPendingEstimateMs()).toBe(0);
  });

  it('releases the estimate when the action is dropped as epoch-stale', () => {
    const staleQueue = new ActionQueue(makeControl(5)); // live epoch 5
    staleQueue.start();
    const onDrop = vi.fn();
    staleQueue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      estimatedCooldownMs: 400,
      epoch: 3, // stale at dequeue
      onDrop,
      execute: () => 0,
    });
    expect(staleQueue.globalPendingEstimateMs()).toBe(400);
    vi.advanceTimersByTime(500);
    expect(onDrop).toHaveBeenCalledOnce();
    expect(staleQueue.globalPendingEstimateMs()).toBe(0);
    staleQueue.stop();
  });

  it('stop() clears every pending estimate', () => {
    queue.enqueue({
      priority: EActionPriority.LOW,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      estimatedCooldownMs: 700,
      execute: () => 0,
    });
    queue.stop();
    expect(queue.globalPendingEstimateMs()).toBe(0);
  });
});

describe('cooldown fairness (blocked top does not freeze the queue)', () => {
  it('drains the next eligible action behind a cooled-down heap-top', () => {
    const executed: string[] = [];
    // A drains first and blocks KEY_A for 5s.
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A');
        return 5000;
      },
    });
    vi.advanceTimersByTime(500); // A drained; KEY_A blocked for ~5s

    // A2 (same blocked key, higher priority) enqueued BEFORE B — B must not wait 5s.
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A2');
        return 0;
      },
    });
    queue.enqueue({
      priority: EActionPriority.NORMAL,
      cooldownKey: KEY_B,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('B');
        return 0;
      },
    });
    vi.advanceTimersByTime(500); // B drains promptly, jumping the blocked A2
    expect(executed).toEqual(['A', 'B']);

    vi.advanceTimersByTime(6000); // KEY_A expiry → A2 finally drains
    expect(executed).toEqual(['A', 'B', 'A2']);
  });

  it('preserves FIFO within the same cooldown key', () => {
    const executed: string[] = [];
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A');
        return 5000;
      },
    });
    vi.advanceTimersByTime(500);
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A2');
        return 0;
      },
    });
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A3');
        return 0;
      },
    });
    vi.advanceTimersByTime(7000);
    expect(executed).toEqual(['A', 'A2', 'A3']);
  });

  it('drops stale actions encountered during the fairness scan (no cooldown wait)', () => {
    const onDrop = vi.fn();
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => 5000, // block KEY_A
    });
    vi.advanceTimersByTime(500);
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A, // blocked top
      enqueuedAt: Date.now(),
      execute: () => 0,
    });
    queue.enqueue({
      priority: EActionPriority.NORMAL,
      cooldownKey: KEY_B,
      enqueuedAt: Date.now() - 20_000, // already stale at enqueue
      onDrop,
      execute: () => 0,
    });
    vi.advanceTimersByTime(500); // scan reaches the stale action without waiting 5s
    expect(onDrop).toHaveBeenCalledOnce();
  });

  it('a fresh drainable enqueue preempts a parked all-blocked wake', () => {
    const executed: string[] = [];
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A');
        return 5000; // block KEY_A ~5s
      },
    });
    vi.advanceTimersByTime(500);
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A, // blocked — alone in the queue → wake parks ~5s out
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A2');
        return 0;
      },
    });
    vi.advanceTimersByTime(500);
    expect(executed).toEqual(['A']);

    queue.enqueue({
      priority: EActionPriority.NORMAL,
      cooldownKey: KEY_B, // freely drainable — must NOT wait for KEY_A's wake
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('B');
        return 0;
      },
    });
    vi.advanceTimersByTime(500);
    expect(executed).toEqual(['A', 'B']);
  });

  it('parks the wake at the earliest of two blocked expiries', () => {
    const executed: string[] = [];
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A');
        return 5000;
      },
    });
    vi.advanceTimersByTime(500); // A drains; KEY_A blocked until ~5500
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_B,
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('B');
        return 8000;
      },
    });
    vi.advanceTimersByTime(500); // B drains; KEY_B blocked until ~9000

    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_A, // blocked until ~5500
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('A2');
        return 0;
      },
    });
    queue.enqueue({
      priority: EActionPriority.HIGH,
      cooldownKey: KEY_B, // blocked until ~9000
      enqueuedAt: Date.now(),
      execute: () => {
        executed.push('B2');
        return 0;
      },
    });
    vi.advanceTimersByTime(500); // both blocked → wake parks at the EARLIEST (~5500)
    expect(executed).toEqual(['A', 'B']);

    vi.advanceTimersByTime(5500); // KEY_A expiry → A2 drains first
    expect(executed).toEqual(['A', 'B', 'A2']);

    vi.advanceTimersByTime(4500); // KEY_B expiry → B2 drains
    expect(executed).toEqual(['A', 'B', 'A2', 'B2']);
  });
});
