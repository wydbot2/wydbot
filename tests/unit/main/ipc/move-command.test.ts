/**
 * IPC MOVE handler (ipc-command-handlers.ts):
 *  - session not in-world (no ActionQueue / MovementState) → immediate
 *    MOVE_REJECTED 'no-result' instead of a silent drop (a silent drop would
 *    burn the renderer's 5s echo floor);
 *  - MOVE_ENQUEUED's expectedTotalMs is backlog-aware across ALL queue keys.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';

vi.mock('@main/logging', () => ({
  ipcLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));
vi.mock('@main/session', () => ({
  EActionPriority: { EMERGENCY: 0, HIGH: 1, NORMAL: 2, LOW: 3 },
}));
vi.mock('@main/platform', () => ({
  resolveLoginHardwareIdentity: vi.fn(async () => ({
    adapterGuid: Buffer.alloc(16),
    mac: Buffer.alloc(6),
  })),
}));

import { registerCommandHandlers } from '@main/ipc/ipc-command-handlers';
import { registerTrustedSender, unregisterTrustedSender } from '@main/ipc/sender-validation';
import { IPC } from '@shared/ipc/ipc-channels';
import { OPCODE_MOVE } from '@shared/constants/opcodes';
import { calcMoveCooldownMs } from '@shared/lib/movement-math';
import type { SessionCtx } from '@main/window-registry';
import type { IpcListenFn } from '@main/ipc/ipc-types';

const TRUSTED = 7;
const evt = (): IpcMainEvent => ({ sender: { id: TRUSTED } }) as unknown as IpcMainEvent;

type Listener = (event: IpcMainEvent, raw: unknown) => void;

const MOVE_PAYLOAD = { moveId: 1, destiny: { x: 100, y: 100 }, moveType: 0, speedMove: 5 };

let listeners: Map<string, Listener>;
const on: IpcListenFn = (channel, fn) => {
  listeners.set(channel as string, fn as Listener);
};
const makeSafeHandler =
  () =>
  <T extends unknown[]>(fn: (...args: T) => void) =>
  (...args: T): void => {
    fn(...args);
  };

beforeEach(() => {
  listeners = new Map();
  registerTrustedSender(TRUSTED);
});

afterEach(() => {
  unregisterTrustedSender(TRUSTED);
});

const register = (ctx: SessionCtx | null): void => {
  registerCommandHandlers(() => ctx, makeSafeHandler, on);
};

describe('MOVE — session not in-world', () => {
  it('rejects immediately with no-result when the ActionQueue is absent', () => {
    const send = vi.fn();
    register({
      session: {
        getActionQueue: () => null,
        getMovementState: () => null,
      },
      send,
    } as unknown as SessionCtx);

    listeners.get(IPC.MOVE)?.(evt(), MOVE_PAYLOAD);
    expect(send).toHaveBeenCalledWith(IPC.MOVE_REJECTED, { moveId: 1, reason: 'no-result' });
  });

  it('rejects immediately when the MovementState is absent', () => {
    const send = vi.fn();
    register({
      session: {
        getActionQueue: () => ({ enqueue: vi.fn() }),
        getMovementState: () => null,
      },
      send,
    } as unknown as SessionCtx);

    listeners.get(IPC.MOVE)?.(evt(), MOVE_PAYLOAD);
    expect(send).toHaveBeenCalledWith(IPC.MOVE_REJECTED, { moveId: 1, reason: 'no-result' });
  });

  it('no context at all → silent (nothing to reply to)', () => {
    register(null);
    expect(() => listeners.get(IPC.MOVE)?.(evt(), MOVE_PAYLOAD)).not.toThrow();
  });
});

describe('MOVE — backlog-aware echo estimate', () => {
  it('MOVE_ENQUEUED expectedTotalMs = active MOVE cooldown + ALL queued estimates + travel', () => {
    const send = vi.fn();
    const enqueue = vi.fn();
    register({
      session: {
        getActionQueue: () => ({
          remainingCooldownMs: () => 200, // active cooldown on the MOVE key
          globalPendingEstimateMs: () => 350, // queued work across all keys (combat etc.)
          enqueue,
        }),
        getMovementState: () => ({
          epoch: 3,
          getPredictedPosition: () => ({ x: 0, y: 0 }),
        }),
      },
      send,
    } as unknown as SessionCtx);

    listeners.get(IPC.MOVE)?.(evt(), MOVE_PAYLOAD);

    // Estimate path: cheb((0,0),(100,100))=100 capped at MAX_STEP_DISTANCE=12.
    const travelMs = calcMoveCooldownMs(12, 5);
    expect(send).toHaveBeenCalledWith(IPC.MOVE_ENQUEUED, {
      moveId: 1,
      expectedTotalMs: 200 + 350 + travelMs,
    });
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      priority: 1, // EActionPriority.HIGH
      cooldownKey: OPCODE_MOVE,
      epoch: 3,
      estimatedCooldownMs: travelMs,
    });
  });
});
