import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientConnection, ClientControl } from '@main/protocol';
import { KeepAlive } from '@main/session/keep-alive';

// Mirror the module's private constants (re-send after 240s silence, poll 30s).
const IDLE_THRESHOLD_MS = 240_000;
const CHECK_INTERVAL_MS = 30_000;

const makeStub = () => {
  let connected = true;
  let lastSendTime = 0;
  let calls = 0;
  const conn = {
    get isConnected() {
      return connected;
    },
    get lastSendTime() {
      return lastSendTime;
    },
  } as unknown as ClientConnection;
  const control = {
    keepAlive() {
      calls += 1;
    },
  } as unknown as ClientControl;
  return {
    conn,
    control,
    calls: () => calls,
    setConnected: (v: boolean) => {
      connected = v;
    },
    setLastSend: (ms: number) => {
      lastSendTime = ms;
    },
  };
};

describe('KeepAlive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends 0x3A0 once outbound has been silent past the threshold', () => {
    const stub = makeStub();
    stub.setLastSend(0);
    const ka = new KeepAlive(stub.conn, stub.control);
    ka.start();

    // Just under the threshold — no keepalive yet.
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS - CHECK_INTERVAL_MS);
    expect(stub.calls()).toBe(0);

    // Next poll crosses the threshold — fires.
    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
    expect(stub.calls()).toBe(1);
    ka.stop();
  });

  it('stays silent while outbound is recent (active play never triggers it)', () => {
    const stub = makeStub();
    const ka = new KeepAlive(stub.conn, stub.control);
    ka.start();
    // Each poll, the player has just sent something → idle window never grows.
    for (let i = 0; i < 20; i++) {
      stub.setLastSend(Date.now());
      vi.advanceTimersByTime(CHECK_INTERVAL_MS);
    }
    expect(stub.calls()).toBe(0);
    ka.stop();
  });

  it('does not send when the socket is disconnected', () => {
    const stub = makeStub();
    stub.setConnected(false);
    stub.setLastSend(0);
    const ka = new KeepAlive(stub.conn, stub.control);
    ka.start();
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS * 2);
    expect(stub.calls()).toBe(0);
    ka.stop();
  });

  it('stop() halts further keepalives', () => {
    const stub = makeStub();
    stub.setLastSend(0);
    const ka = new KeepAlive(stub.conn, stub.control);
    ka.start();
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS + CHECK_INTERVAL_MS);
    const sentSoFar = stub.calls();
    expect(sentSoFar).toBeGreaterThan(0);
    ka.stop();
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS * 3);
    expect(stub.calls()).toBe(sentSoFar);
  });
});
